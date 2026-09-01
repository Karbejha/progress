'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Directorate, ExecutiveTask, Priority, TaskStatus } from '../types';
import { api } from '../services/api';
import { getSocket } from '../lib/socket';
import { DynamicIcon } from './Icons';
import {
  X,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Layers,
  Trash2,
  Edit3,
  CheckCheck,
  Building2,
  FileText,
  Send,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Check,
  AlertCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface ExecutiveTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  initialDirectorateId?: string;
  initialOpenCreate?: boolean;
}

export const ExecutiveTasksModal: React.FC<ExecutiveTasksModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialDirectorateId,
  initialOpenCreate = false,
}) => {
  const [tasks, setTasks] = useState<ExecutiveTask[]>([]);
  const [directorates, setDirectorates] = useState<Directorate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>(initialDirectorateId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus | 'URGENT'>('ALL');

  // Mode: list or create
  const [isCreating, setIsCreating] = useState(initialOpenCreate);
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<{
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
    selectedDirectorateIds: string[];
  }>({
    title: '',
    description: '',
    priority: 'NORMAL',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    selectedDirectorateIds: initialDirectorateId ? [initialDirectorateId] : [],
  });

  // Edit / Details modal state
  const [editingTask, setEditingTask] = useState<ExecutiveTask | null>(null);
  const [editStatus, setEditStatus] = useState<TaskStatus>('PENDING');
  const [editProgress, setEditProgress] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialDirectorateId) {
      setSelectedDirFilter(initialDirectorateId);
      setForm((prev) => ({
        ...prev,
        selectedDirectorateIds: [initialDirectorateId],
      }));
    }
    if (initialOpenCreate) {
      setIsCreating(true);
    }
  }, [initialDirectorateId, initialOpenCreate]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreating) {
          setIsCreating(false);
        } else if (editingTask) {
          setEditingTask(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isCreating, editingTask, onClose]);

  // Socket listener for real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleTaskUpdate = () => {
      if (isOpen) loadData(false);
    };

    socket.on('executive-task:created', handleTaskUpdate);
    socket.on('executive-task:updated', handleTaskUpdate);
    socket.on('executive-task:deleted', handleTaskUpdate);

    return () => {
      socket.off('executive-task:created', handleTaskUpdate);
      socket.off('executive-task:updated', handleTaskUpdate);
      socket.off('executive-task:deleted', handleTaskUpdate);
    };
  }, [isOpen]);

  const loadData = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      const [tasksRes, dirRes] = await Promise.all([
        api.getExecutiveTasks(),
        api.getDirectorates(),
      ]);
      setTasks(tasksRes);
      setDirectorates(dirRes);
    } catch (err) {
      console.error('Failed to load executive tasks', err);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSelectAllDirectorates = () => {
    if (form.selectedDirectorateIds.length === directorates.length) {
      setForm({ ...form, selectedDirectorateIds: [] });
    } else {
      setForm({ ...form, selectedDirectorateIds: directorates.map((d) => d.id) });
    }
  };

  const handleToggleDirectorate = (id: string) => {
    setForm((prev) => {
      const exists = prev.selectedDirectorateIds.includes(id);
      return {
        ...prev,
        selectedDirectorateIds: exists
          ? prev.selectedDirectorateIds.filter((dId) => dId !== id)
          : [...prev.selectedDirectorateIds, id],
      };
    });
  };

  const handleCreateTasks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('يرجى كتابة عنوان التكليف');
      return;
    }
    if (form.selectedDirectorateIds.length === 0) {
      alert('يرجى تحديد مديرية واحدة على الأقل');
      return;
    }

    try {
      setSubmitting(true);
      await api.createExecutiveTasks({
        title: form.title,
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate,
        directorateIds: form.selectedDirectorateIds,
      });

      showToast(
        `تم إسناد التكليف بنجاح لـ (${form.selectedDirectorateIds.length}) مديرية وإشعار المدراء فوراً!`,
      );
      setForm({
        title: '',
        description: '',
        priority: 'NORMAL',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        selectedDirectorateIds: [],
      });
      setIsCreating(false);
      loadData(false);
    } catch (err: any) {
      console.error('Failed to create executive tasks', err);
      alert(err.message || 'حدث خطأ أثناء إسناد التكليف');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (task: ExecutiveTask) => {
    const nextStatus: TaskStatus = task.status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
    const nextPct = nextStatus === 'COMPLETED' ? 100 : 50;

    try {
      await api.updateExecutiveTask(task.id, {
        status: nextStatus,
        completionPercentage: nextPct,
      });
      showToast(
        nextStatus === 'COMPLETED'
          ? 'تم اعتماد اكتمال التكليف بنجاح'
          : 'تم تغيير حالة التكليف إلى قيد التنفيذ',
      );
      loadData(false);
    } catch (err) {
      console.error('Failed to update task status', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التكليف؟')) return;

    try {
      await api.deleteExecutiveTask(taskId);
      showToast('تم حذف التكليف بنجاح');
      loadData(false);
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;

    try {
      setSubmitting(true);
      await api.updateExecutiveTask(editingTask.id, {
        status: editStatus,
        completionPercentage: editProgress,
        completionNote: editNote,
      });
      showToast('تم حفظ التعديلات بنجاح');
      setEditingTask(null);
      loadData(false);
    } catch (err) {
      console.error('Failed to update task', err);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (task: ExecutiveTask) => {
    setEditingTask(task);
    setEditStatus(task.status);
    setEditProgress(task.completionPercentage);
    setEditNote(task.completionNote || '');
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
      (t.directorate?.name && t.directorate.name.toLowerCase().includes(search.toLowerCase())) ||
      (t.completionNote && t.completionNote.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedDirFilter !== 'ALL' && t.directorateId !== selectedDirFilter) {
      return false;
    }

    if (statusFilter === 'URGENT') {
      return t.priority === 'URGENT' || t.priority === 'HIGH';
    }

    if (statusFilter !== 'ALL' && t.status !== statusFilter) {
      return false;
    }

    return true;
  });

  // Stats calculation
  const totalTasksCount = tasks.length;
  const pendingCount = tasks.filter((t) => t.status === 'PENDING').length;
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const urgentCount = tasks.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length;

  if (!mounted || !isOpen) return null;

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            عاجل جداً
          </span>
        );
      case 'HIGH':
        return (
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            أولوية مرتفعة
          </span>
        );
      case 'LOW':
        return (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            منخفض
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0c3e35]/10 text-[#0c3e35] border border-[#0c3e35]/20">
            عادي
          </span>
        );
    }
  };

  const getStatusBadge = (s: TaskStatus) => {
    switch (s) {
      case 'COMPLETED':
        return (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            مكتملة ومُنجزة
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            قيد التنفيذ
          </span>
        );
      case 'DELAYED':
        return (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            متأخرة
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            قيد الانتظار
          </span>
        );
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-sm animate-fadeIn">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-6 left-6 z-[60] flex items-center gap-2.5 bg-[#05261e] border-2 border-[#d4af37] text-white px-4 py-3 rounded-2xl shadow-2xl animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-[#d4af37]" />
          <span className="text-xs font-bold text-[#edece4]">{toastMsg}</span>
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] bg-[#fcfbf7] border border-[#d2d1c9] rounded-[28px] shadow-2xl flex flex-col overflow-hidden text-[#05261e]"
      >
        {/* Top Header Banner */}
        <div className="p-5 sm:p-6 bg-[#05261e] border-b border-[#0c3e35] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-inner">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  التكليفات والتوجيهات المباشرة للمديريات
                </h2>
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/40">
                  إسناد رئاسي
                </span>
              </div>
              <p className="text-xs text-[#8daaa2] mt-0.5">
                إسناد مهام محددة للمدراء ومتابعة نسب الإنجاز وردود التنفيذ بشكل مباشر ولحظي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#d4af37] text-[#05261e] hover:bg-[#c5a059] transition shadow-md active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إسناد تكليف جديد</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#0c3e35] text-[#8daaa2] hover:text-white hover:bg-[#0c4237] transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Create Task Form View */}
        {isCreating ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="p-1.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#0c3e35] hover:text-white transition cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <h3 className="text-base font-extrabold text-[#0c3e35]">
                  نموذج إسناد تكليف / مهمة جديدة لمدراء المديريات
                </h3>
              </div>
              <span className="text-xs text-[#5e736e]">
                المُسنِد: <strong className="text-[#0c3e35]">{currentUser.fullName}</strong> ({currentUser.title})
              </span>
            </div>

            <form onSubmit={handleCreateTasks} className="space-y-5">
              {/* Task Title */}
              <div>
                <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
                  عنوان التكليف أو المهمة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: جرد زوارق الصيد غير المرخصة في ميناء طرطوس، إعداد تقرير الصيانة العاجل..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-xs sm:text-sm text-[#0c3e35] font-semibold placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] focus:ring-1 focus:ring-[#0c3e35]"
                />
              </div>

              {/* Priority & Due Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
                    مستوى الأولوية
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  >
                    <option value="URGENT">🚨 عاجل جداً (أولوية قصوى)</option>
                    <option value="HIGH">⚠️ أولوية مرتفعة</option>
                    <option value="NORMAL">📌 أولوية عادية</option>
                    <option value="LOW">⏳ أولوية منخفضة / غير عاجلة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
                    تاريخ الاستحقاق المطلوب للتنفيذ
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              {/* Target Directorates Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-[#0c3e35]">
                    المديريات المكلفة بالتنفيذ <span className="text-red-500">*</span> ({form.selectedDirectorateIds.length} محددة)
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllDirectorates}
                    className="text-xs font-bold text-[#0c3e35] hover:text-[#d4af37] underline cursor-pointer"
                  >
                    {form.selectedDirectorateIds.length === directorates.length
                      ? 'إلغاء تحديد الكل'
                      : 'تحديد كافة المديريات العشرين'}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-[#d2d1c9] max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {directorates.map((dir) => {
                    const isSelected = form.selectedDirectorateIds.includes(dir.id);
                    return (
                      <button
                        type="button"
                        key={dir.id}
                        onClick={() => handleToggleDirectorate(dir.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl text-right text-xs font-bold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-[#0c3e35] text-white border-[#0c3e35] shadow-xs'
                            : 'bg-[#f4f3ed] text-[#05261e] border-[#d2d1c9] hover:bg-[#edece4]'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-[#d4af37] border-[#d4af37] text-[#05261e]'
                              : 'bg-white border-[#d2d1c9]'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">{dir.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description & Directives */}
              <div>
                <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
                  تفاصيل التكليف والتوجيهات والنتائج المطلوبة
                </label>
                <textarea
                  rows={4}
                  placeholder="اكتب التوجيهات التفصيلية، الخطوات المطلوبة، أو آلية الرفع المحددة لمدير المديرية..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35] placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] leading-relaxed"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#d2d1c9] text-xs font-bold text-[#5e736e] hover:bg-white transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#0c4237] transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-[#d4af37]" />
                  )}
                  <span>إسناد التكليف للمديريات المحددة</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Tasks List View */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Stats KPI Chips */}
            <div className="p-4 sm:p-5 bg-white border-b border-[#d2d1c9] grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-[#0c3e35] text-white border-[#0c3e35] shadow-xs'
                    : 'bg-[#f4f3ed] border-[#d2d1c9] text-[#05261e] hover:bg-[#edece4]'
                }`}
              >
                <div className="text-[11px] font-semibold opacity-80">إجمالي التكليفات</div>
                <div className="text-lg font-extrabold mt-0.5">{totalTasksCount}</div>
              </button>

              <button
                onClick={() => setStatusFilter('PENDING')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100'
                }`}
              >
                <div className="text-[11px] font-semibold opacity-80">قيد الانتظار</div>
                <div className="text-lg font-extrabold mt-0.5">{pendingCount}</div>
              </button>

              <button
                onClick={() => setStatusFilter('IN_PROGRESS')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100'
                }`}
              >
                <div className="text-[11px] font-semibold opacity-80">قيد التنفيذ</div>
                <div className="text-lg font-extrabold mt-0.5">{inProgressCount}</div>
              </button>

              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                <div className="text-[11px] font-semibold opacity-80">مكتملة ومُنجزة</div>
                <div className="text-lg font-extrabold mt-0.5">{completedCount}</div>
              </button>

              <button
                onClick={() => setStatusFilter('URGENT')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer col-span-2 sm:col-span-1 ${
                  statusFilter === 'URGENT'
                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                    : 'bg-red-50/70 border-red-200 text-red-900 hover:bg-red-100'
                }`}
              >
                <div className="text-[11px] font-semibold opacity-80">عاجلة ومرتفعة</div>
                <div className="text-lg font-extrabold mt-0.5">{urgentCount}</div>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-4 bg-[#f4f3ed] border-b border-[#d2d1c9] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-[#8daaa2] absolute right-3 top-3" />
                <input
                  type="text"
                  placeholder="البحث في المهام، المديريات، أو الملاحظات..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35] placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35]"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-[#5e736e] shrink-0" />
                <select
                  value={selectedDirFilter}
                  onChange={(e) => setSelectedDirFilter(e.target.value)}
                  className="w-full sm:w-auto p-2 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                >
                  <option value="ALL">كافة المديريات والمكاتب (20)</option>
                  {directorates.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scrollable Tasks Cards Grid */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#5e736e]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0c3e35] mb-2" />
                  <span className="text-xs font-bold">جارٍ تحميل التكليفات...</span>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#5e736e] bg-white rounded-2xl border border-dashed border-[#d2d1c9]">
                  <Layers className="w-12 h-12 text-[#8daaa2] mb-3 stroke-[1.5]" />
                  <h4 className="text-sm font-extrabold text-[#0c3e35]">لا توجد تكليفات مطابقة</h4>
                  <p className="text-xs text-[#5e736e] mt-1">
                    {search || selectedDirFilter !== 'ALL' || statusFilter !== 'ALL'
                      ? 'جرّب تعديل خيارات التصفية أو البحث'
                      : 'لم يتم إسناد أي مهام بعد، اضغط على "إسناد تكليف جديد" للبدء'}
                  </p>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#0c4237] transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إسناد تكليف الآن</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {filteredTasks.map((task) => {
                    const isCompleted = task.status === 'COMPLETED';
                    const dueDateStr = task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString('ar-SY', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : null;

                    const createdDateStr = new Date(task.createdAt).toLocaleDateString('ar-SY', {
                      day: 'numeric',
                      month: 'short',
                    });

                    return (
                      <div
                        key={task.id}
                        className={`p-5 rounded-2xl border transition shadow-xs hover:shadow-md ${
                          isCompleted
                            ? 'bg-white/80 border-emerald-200'
                            : 'bg-white border-[#d2d1c9]'
                        }`}
                      >
                        {/* Task Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0eee6] pb-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-bold px-3 py-1 rounded-xl bg-[#0c3e35] text-white flex items-center gap-1.5">
                              <DynamicIcon name={task.directorate?.icon || 'Building2'} className="w-3.5 h-3.5 text-[#d4af37]" />
                              {task.directorate?.name}
                            </span>
                            {getPriorityBadge(task.priority)}
                            {getStatusBadge(task.status)}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-[#5e736e]">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              أُسند بتاريخ: {createdDateStr}
                            </span>
                            {dueDateStr && (
                              <span className="flex items-center gap-1 font-bold text-[#0c3e35] bg-[#f4f3ed] px-2 py-0.5 rounded-lg border border-[#d2d1c9]">
                                <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                                الاستحقاق: {dueDateStr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Task Title & Description */}
                        <div className="my-3 space-y-1.5">
                          <h4 className="text-sm sm:text-base font-extrabold text-[#05261e] leading-snug">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-[#5e736e] leading-relaxed whitespace-pre-line bg-[#fcfbf7] p-2.5 rounded-xl border border-[#edece4]">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1.5 bg-[#f4f3ed] p-3 rounded-xl border border-[#d2d1c9]/70">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-[#0c3e35]">نسبة الإنجاز المحققة:</span>
                            <span className={`${task.completionPercentage === 100 ? 'text-emerald-700' : 'text-[#0c3e35]'}`}>
                              {task.completionPercentage}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-[#d2d1c9]/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${
                                task.completionPercentage === 100
                                  ? 'bg-emerald-600'
                                  : task.completionPercentage > 50
                                  ? 'bg-blue-600'
                                  : 'bg-[#d4af37]'
                              }`}
                              style={{ width: `${task.completionPercentage}%` }}
                            />
                          </div>

                          {/* Director's Execution Notes / Response */}
                          {task.completionNote && (
                            <div className="mt-2 pt-2 border-t border-[#d2d1c9]/60 flex items-start gap-2 text-xs">
                              <MessageSquare className="w-4 h-4 text-[#0c3e35] shrink-0 mt-0.5" />
                              <div className="text-xs text-[#05261e]">
                                <strong className="text-[#0c3e35]">تقرير ورد مدير المديرية: </strong>
                                <span className="font-medium">{task.completionNote}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer & Actions */}
                        <div className="mt-3.5 pt-3 border-t border-[#f0eee6] flex items-center justify-between gap-3 text-xs flex-wrap">
                          <div className="text-[#5e736e] text-[11px]">
                            بواسطة: <strong className="text-[#0c3e35]">{task.assignedBy?.fullName}</strong> ({task.assignedBy?.title})
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStatus(task)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition cursor-pointer text-xs ${
                                isCompleted
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              }`}
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>{isCompleted ? 'إعادة للعمل' : 'اعتماد كمنجز'}</span>
                            </button>

                            <button
                              onClick={() => openEditModal(task)}
                              className="p-1.5 rounded-xl text-[#0c3e35] hover:bg-[#edece4] border border-[#d2d1c9] transition cursor-pointer"
                              title="تعديل التكليف"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1.5 rounded-xl text-red-600 hover:bg-red-50 border border-red-200 transition cursor-pointer"
                              title="حذف التكليف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl p-6 border border-[#d2d1c9] shadow-2xl space-y-4 text-[#05261e]"
          >
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-3">
              <h3 className="text-sm font-extrabold text-[#0c3e35] flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                تحديث حالة ونسبة إنجاز التكليف
              </h3>
              <button
                onClick={() => setEditingTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs font-bold text-[#0c3e35] bg-[#f4f3ed] p-3 rounded-xl">
              {editingTask.title} ({editingTask.directorate?.name})
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#0c3e35] mb-1">
                  الحالة التشغيلية
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                  className="w-full p-2 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35]"
                >
                  <option value="PENDING">قيد الانتظار</option>
                  <option value="IN_PROGRESS">قيد التنفيذ والمتابعة</option>
                  <option value="COMPLETED">مكتملة ومُنجزة بالكامل</option>
                  <option value="DELAYED">متأخرة</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold text-[#0c3e35] mb-1">
                  <span>نسبة الإنجاز:</span>
                  <span>{editProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  className="w-full accent-[#0c3e35] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0c3e35] mb-1">
                  ملاحظات أو توجيهات إضافية
                </label>
                <textarea
                  rows={3}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="أدخل أي ملاحظات..."
                  className="w-full p-2.5 rounded-xl bg-[#fcfbf7] border border-[#d2d1c9] text-xs text-[#0c3e35]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#5e736e] hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#0c4237] cursor-pointer shadow-sm"
              >
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
};
