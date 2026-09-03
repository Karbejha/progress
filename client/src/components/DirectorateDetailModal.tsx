'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DirectorateOverviewItem, ExecutiveTask, Priority, TaskStatus } from '../types';
import { api } from '../services/api';
import {
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Star,
  MessageSquare,
  Sparkles,
  FileText,
  Layers,
  Plus,
  Calendar,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';
import { DynamicIcon } from './Icons';

interface DirectorateDetailModalProps {
  item: DirectorateOverviewItem | null;
  onClose: () => void;
  onFeedbackSent: () => void;
}

export const DirectorateDetailModal: React.FC<DirectorateDetailModalProps> = ({
  item,
  onClose,
  onFeedbackSent,
}) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Executive tasks state
  const [executiveTasks, setExecutiveTasks] = useState<ExecutiveTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showAssignTaskForm, setShowAssignTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState<{
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
  }>({
    title: '',
    description: '',
    priority: 'NORMAL',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!item) return;

    loadDirectorateTasks();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, onClose]);

  const loadDirectorateTasks = async () => {
    if (!item) return;
    try {
      setLoadingTasks(true);
      const res = await api.getExecutiveTasks({ directorateId: item.directorateId });
      setExecutiveTasks(res);
    } catch (err) {
      console.error('Failed to load directorate executive tasks', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleCreateDirectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !taskForm.title.trim()) return;

    try {
      setTaskSubmitting(true);
      await api.createExecutiveTasks({
        title: taskForm.title,
        description: taskForm.description,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate,
        directorateIds: [item.directorateId],
      });
      setTaskForm({
        title: '',
        description: '',
        priority: 'NORMAL',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
      setShowAssignTaskForm(false);
      loadDirectorateTasks();
      onFeedbackSent();
    } catch (err) {
      console.error('Failed to assign task', err);
    } finally {
      setTaskSubmitting(false);
    }
  };

  if (!mounted || !item) return null;

  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) return;

    try {
      setSubmitting(true);
      await api.sendFeedback({
        directorateId: item.directorateId,
        dailyPlanId: item.planId || undefined,
        feedbackText,
        rating,
      });
      setSuccessMessage(true);
      setFeedbackText('');
      setTimeout(() => {
        setSuccessMessage(false);
        onFeedbackSent();
      }, 1500);
    } catch (err) {
      console.error('Failed to send feedback', err);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'URGENT':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">عاجل جداً</span>;
      case 'HIGH':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">أولوية مرتفعة</span>;
      default:
        return <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">عادي</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> مكتملة</span>;
      case 'IN_PROGRESS':
        return <span className="text-[11px] font-bold text-[#0c3e35] flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> قيد التنفيذ</span>;
      case 'DELAYED':
        return <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> مؤجلة</span>;
      default:
        return <span className="text-[11px] font-medium text-[#5e736e]">قيد الانتظار</span>;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-md">
              <DynamicIcon name={item.icon} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">{item.directorateName}</h2>
                {item.urgentFlag && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500/30 border border-red-400 text-red-300 animate-pulse">
                    تنبيه عاجل
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8daaa2] mt-0.5 font-medium">
                المدير المسؤول: <strong className="text-[#d4af37]">{item.director?.fullName || 'غير محدد'}</strong> {item.director?.phone ? `(${item.director.phone})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Section 0: Executive Tasks Assigned to this Directorate */}
          <div className="p-5 rounded-[22px] bg-white border border-[#d2d1c9] space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#f0eee6] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#d4af37]" />
                <h3 className="text-sm font-bold text-[#0c3e35]">
                  تكليفات وتوجيهات المدير العام للمديرية ({executiveTasks.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignTaskForm(!showAssignTaskForm)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#0c4237] transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>{showAssignTaskForm ? 'إخفاء النموذج' : 'إسناد تكليف فوري'}</span>
              </button>
            </div>

            {/* Quick Task Creation Form */}
            {showAssignTaskForm && (
              <form onSubmit={handleCreateDirectTask} className="p-4 rounded-2xl bg-[#f4f3ed] border border-[#d2d1c9] space-y-3 animate-fadeIn">
                <div className="text-xs font-extrabold text-[#0c3e35] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>إسناد تكليف مباشر لـ {item.directorateName}</span>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    placeholder="عنوان التكليف أو المهمة المطلوبة..."
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35] font-semibold focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Priority })}
                      className="w-full p-2 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35]"
                    >
                      <option value="URGENT">🚨 عاجل جداً</option>
                      <option value="HIGH">⚠️ أولوية مرتفعة</option>
                      <option value="NORMAL">📌 أولوية عادية</option>
                      <option value="LOW">⏳ منخفض</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                      className="w-full p-2 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35]"
                    />
                  </div>
                </div>

                <div>
                  <textarea
                    rows={2}
                    placeholder="التفاصيل والتوجيهات المحددة..."
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAssignTaskForm(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#5e736e] hover:bg-white transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={taskSubmitting}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#0c4237] shadow-sm transition cursor-pointer"
                  >
                    {taskSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#d4af37]" />}
                    <span>إرسال التكليف</span>
                  </button>
                </div>
              </form>
            )}

            {/* Existing Tasks List */}
            {loadingTasks ? (
              <div className="py-4 text-center text-xs text-[#5e736e]">جارٍ تحميل التكليفات...</div>
            ) : executiveTasks.length === 0 ? (
              <div className="py-3 text-center text-xs text-[#5e736e] bg-[#fcfbf7] rounded-xl border border-dashed border-[#d2d1c9]">
                لا توجد تكليفات مسندة من المدير العام لهذه المديرية حالياً.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto">
                {executiveTasks.map((t) => (
                  <div key={t.id} className="p-3.5 rounded-xl bg-[#fcfbf7] border border-[#d2d1c9] space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-extrabold text-[#05261e]">{t.title}</span>
                      <div className="flex items-center gap-1.5">
                        {getPriorityBadge(t.priority)}
                        {getStatusBadge(t.status)}
                      </div>
                    </div>
                    {t.description && <p className="text-[#5e736e] leading-relaxed">{t.description}</p>}
                    
                    {/* Progress */}
                    <div className="space-y-1 bg-[#f4f3ed] p-2 rounded-lg">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#0c3e35]">
                        <span>نسبة الإنجاز:</span>
                        <span>{t.completionPercentage}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#d2d1c9]/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${t.completionPercentage === 100 ? 'bg-emerald-600' : 'bg-[#d4af37]'}`}
                          style={{ width: `${t.completionPercentage}%` }}
                        />
                      </div>
                      {t.completionNote && (
                        <div className="text-[11px] text-[#05261e] mt-1 pt-1 border-t border-[#d2d1c9]/50">
                          <strong>رد مدير المديرية: </strong>
                          <span>{t.completionNote}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 1: Morning Plan Overview */}
          <div className="p-5 rounded-[22px] bg-white border border-[#d2d1c9] space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#f0eee6] pb-3">
              <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0c3e35]" />
                الخطة الصباحية المعتمدة
              </h3>
              <span className="text-xs font-bold text-[#5e736e]">
                {item.tasks?.length || 0} مهام مجدولة
              </span>
            </div>

            {item.generalFocus && (
              <div className="p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-xs text-[#0c3e35]">
                <strong className="font-bold">التركيز العام لليوم: </strong>
                <span>{item.generalFocus}</span>
              </div>
            )}

            {item.tasks && item.tasks.length > 0 ? (
              <div className="space-y-2 mt-2">
                {item.tasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#fcfbf7] border border-[#d2d1c9] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="w-5 h-5 rounded-full bg-[#0c3e35] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-[#05261e]">{task.title}</p>
                        {task.description && (
                          <p className="text-[11px] text-[#5e736e]">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-bold text-[#0c3e35]">{task.completionPercentage}%</span>
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#5e736e] py-3 text-center">لم يتم رفع خطة صباحية لهذا اليوم</p>
            )}
          </div>

          {/* Section 2: Evening Summary Overview */}
          <div className="p-5 rounded-[22px] bg-white border border-[#d2d1c9] space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#f0eee6] pb-3">
              <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
                ملخص الإنجاز المسائي
              </h3>
              {item.hasSummary && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300">
                  نسبة الإنجاز الكلية: {item.completionRate}%
                </span>
              )}
            </div>

            {item.hasSummary ? (
              <div className="space-y-3 text-xs">
                <div>
                  <strong className="text-[#0c3e35] font-bold block mb-1">بيان إنجاز نهاية اليوم:</strong>
                  <p className="p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#05261e] leading-relaxed">
                    {item.summaryText}
                  </p>
                </div>

                {item.achievements && item.achievements.length > 0 && (
                  <div>
                    <strong className="text-emerald-800 font-bold block mb-1">أبرز المحطات المنجزة:</strong>
                    <ul className="list-disc list-inside space-y-1 text-[#05261e] pr-2">
                      {item.achievements.map((ach, i) => (
                        <li key={i}>{ach}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.challenges && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <strong className="font-bold block mb-0.5">العوائق والتحديات المعترضة:</strong>
                    <span>{item.challenges}</span>
                  </div>
                )}

                {item.directorNotes && (
                  <div>
                    <strong className="text-[#0c3e35] font-bold block mb-1">مقترحات وتوصيات المدير:</strong>
                    <p className="text-[#5e736e]">{item.directorNotes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#5e736e] py-3 text-center">لم يتم تسليم ملخص الإنجاز المسائي بعد</p>
            )}
          </div>

          {/* Section 3: Previous Feedback History */}
          {item.feedbacks && item.feedbacks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2 border-b border-[#d2d1c9] pb-2">
                <MessageSquare className="w-4 h-4 text-[#d4af37]" />
                توجيهات وملاحظات المدير العام السابقة
              </h3>
              <div className="space-y-2">
                {item.feedbacks.map((fb, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-[#05261e] text-white text-xs space-y-1.5 border border-[#d4af37]/40 shadow-sm">
                    <div className="flex items-center justify-between text-[11px] text-[#d4af37]">
                      <span className="font-bold">{fb.fromUser?.fullName || 'المدير العام'} ({fb.fromUser?.title})</span>
                      <span>{new Date(fb.createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[#edece4] text-xs mt-1 leading-relaxed">{fb.feedbackText}</p>
                    {fb.rating && (
                      <div className="flex items-center gap-1 text-[#d4af37] pt-1">
                        {Array.from({ length: fb.rating }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-[#d4af37] text-[#d4af37]" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Direct General Director Feedback Form */}
          <div className="p-5 rounded-[22px] bg-white border border-[#d2d1c9] space-y-3 shadow-xs">
            <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2">
              <Send className="w-4 h-4 text-[#0c3e35]" />
              إرسال توجيهات / ملاحظات المدير العام لمدير المديرية
            </h3>

            <div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="اكتب التوجيه، الملاحظات، أو الإشادة بجهود المديرية..."
                rows={3}
                className="w-full p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs text-[#5e736e] font-bold">
                <span>التقييم:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-125 transition cursor-pointer"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          star <= rating
                            ? 'fill-[#d4af37] text-[#d4af37]'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {successMessage && (
                  <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    تم إرسال التوجيه بنجاح!
                  </span>
                )}
                <button
                  onClick={handleSendFeedback}
                  disabled={submitting || !feedbackText.trim()}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'جاري الإرسال...' : 'إرسال التوجيه فوراً'}</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2d1c9] bg-white flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#edece4] text-[#0c3e35] hover:bg-[#d2d1c9] text-xs font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
