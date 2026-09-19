'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowRightLeft,
  Plus,
  Calendar,
  Sparkles,
  Layers,
  Trash2,
  Info,
  Check,
  Loader2,
} from 'lucide-react';
import { IncompleteTask, Priority } from '../types';

interface IncompleteTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: IncompleteTask[];
  loading: boolean;
  onSelectTask: (task: IncompleteTask) => void;
  onSelectAll?: (tasks: IncompleteTask[]) => void;
  onDismissTask?: (taskId: string) => Promise<void>;
  alreadyAddedTitles?: string[];
}

export const IncompleteTasksModal: React.FC<IncompleteTasksModalProps> = ({
  isOpen,
  onClose,
  tasks,
  loading,
  onSelectTask,
  onSelectAll,
  onDismissTask,
  alreadyAddedTitles = [],
}) => {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatTaskDate = (dateStr: string | null) => {
    if (!dateStr) return 'تاريخ سابق';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SY', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDaysAgo = (days: number) => {
    if (days <= 0) return null;
    if (days === 1) return 'منذ يوم';
    if (days === 2) return 'منذ يومين';
    if (days >= 3 && days <= 10) return `منذ ${days} أيام`;
    return `منذ ${days} يوماً`;
  };

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            <span>عاجل جداً</span>
          </span>
        );
      case 'HIGH':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 shrink-0 whitespace-nowrap">
            أولوية مرتفعة
          </span>
        );
      case 'LOW':
        return (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 shrink-0 whitespace-nowrap">
            منخفضة
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
            عادية
          </span>
        );
    }
  };

  const normalizedAdded = useMemo(
    () => alreadyAddedTitles.map((t) => t.trim().toLowerCase()),
    [alreadyAddedTitles]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchSearch =
        !searchQuery.trim() ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.completionNote && t.completionNote.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

      return matchSearch && matchPriority;
    });
  }, [tasks, searchQuery, priorityFilter]);

  const availableToImport = useMemo(() => {
    return filteredTasks.filter((t) => !normalizedAdded.includes(t.title.trim().toLowerCase()));
  }, [filteredTasks, normalizedAdded]);

  const handleDismiss = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDismissTask) return;
    if (confirm('هل أنت متأكد من رغبتك في إغلاق هذه المهمة نهائياً واستبعادها من قائمة المتابعة؟')) {
      try {
        setDismissingId(taskId);
        await onDismissTask(taskId);
      } finally {
        setDismissingId(null);
      }
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl sm:max-w-3xl max-h-[94vh] sm:max-h-[90vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-2xl sm:rounded-[28px] shadow-2xl overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-md shrink-0">
              <ArrowRightLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-extrabold text-white">
                  المهام غير المكتملة والمرحّلة
                </h2>
                <span className="text-[11px] sm:text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] shrink-0 whitespace-nowrap">
                  {tasks.length} {tasks.length === 1 ? 'مهمة' : 'مهام معلقة'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#8daaa2] mt-1 font-medium leading-tight sm:leading-normal">
                مهام سابقة لم تكتمل (أقل من 100%) يمكنك ترحيلها بنقرة واحدة لمتابعة إنجازها التراكمي في خطة اليوم.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-3 sm:p-4 bg-white/70 border-b border-[#d2d1c9] flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#8daaa2] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="ابحث في المهام المعلقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35] placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35]"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-[11px] font-bold text-[#5e736e] shrink-0 ml-1">الأولوية:</span>
            {[
              { id: 'ALL', label: 'الكل' },
              { id: 'URGENT', label: 'عاجل جداً' },
              { id: 'HIGH', label: 'مرتفعة' },
              { id: 'NORMAL', label: 'عادية' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPriorityFilter(tab.id)}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold transition cursor-pointer shrink-0 whitespace-nowrap ${
                  priorityFilter === tab.id
                    ? 'bg-[#0c3e35] text-white shadow-xs'
                    : 'bg-white text-[#5e736e] hover:bg-[#f4f3ed] border border-[#d2d1c9]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks List Content */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#0c3e35] mx-auto" />
              <p className="text-xs font-bold text-[#5e736e]">جارٍ استخراج المهام السابقة غير المكتملة...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-white/50 rounded-2xl border border-dashed border-[#d2d1c9]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-[#0c3e35]">
                {searchQuery || priorityFilter !== 'ALL'
                  ? 'لا توجد مهام معلقة مطابقة لبحثك'
                  : 'رائع! لا توجد مهام معلقة أو غير مكتملة'}
              </h3>
              <p className="text-xs text-[#5e736e] max-w-sm mx-auto">
                {searchQuery || priorityFilter !== 'ALL'
                  ? 'جرّب تعديل كلمات البحث أو تصفية الأولويات.'
                  : 'كافة مهام الخطط السابقة أنجزت بنسبة 100% أو تم استكمالها.'}
              </p>
            </div>
          ) : (
            <>
              {/* Batch Actions Bar */}
              {onSelectAll && availableToImport.length > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 mb-1">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>يوجد {availableToImport.length} مهام معلقة متاحة للإدراج</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectAll(availableToImport)}
                    className="flex items-center justify-center gap-1.5 text-xs font-extrabold px-3.5 py-2 rounded-lg bg-[#0c3e35] text-white hover:bg-[#072923] transition cursor-pointer shadow-xs active:scale-95"
                  >
                    <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>ترحيل الكل لخطة اليوم</span>
                  </button>
                </div>
              )}

              {filteredTasks.map((task) => {
                const isAlreadyAdded = normalizedAdded.includes(task.title.trim().toLowerCase());
                const isDismissing = dismissingId === task.id;
                const daysAgoText = formatDaysAgo(task.daysAgo);

                return (
                  <div
                    key={task.id}
                    className={`p-3.5 sm:p-4 rounded-2xl bg-white border transition-all duration-200 shadow-xs flex flex-col gap-3 ${
                      isAlreadyAdded
                        ? 'border-emerald-300 bg-emerald-50/25 opacity-90'
                        : 'border-[#d2d1c9] hover:border-[#0c3e35] hover:shadow-md'
                    }`}
                  >
                    {/* Header & Badges */}
                    <div className="space-y-2">
                      {/* Meta Badges (Priority & Plan Date) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {getPriorityBadge(task.priority)}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                          <Layers className="w-3 h-3 text-indigo-600" />
                          <span>مهمة ممتدة</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#f4f3ed] text-[#5e736e] border border-[#d2d1c9] inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                          <Calendar className="w-3 h-3 text-[#d4af37]" />
                          <span>خطة: {formatTaskDate(task.planDate)}</span>
                          {daysAgoText && (
                            <span className="text-[#8daaa2]">({daysAgoText})</span>
                          )}
                        </span>
                      </div>

                      {/* Full Width Title */}
                      <h3 className="font-extrabold text-[#05261e] text-sm sm:text-base leading-relaxed break-words">
                        {task.title}
                      </h3>

                      {/* Description (if present) */}
                      {task.description && (
                        <p className="text-xs text-[#5e736e] leading-relaxed pt-0.5">
                          {task.description}
                        </p>
                      )}
                    </div>

                    {/* Progress Bar and Previous Notes */}
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#f8f7f2] border border-[#e5e4dc] space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[#0c3e35] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#d4af37]" />
                          <span>نسبة الإنجاز المحققة سابقاً:</span>
                        </span>
                        <span className="text-xs sm:text-sm font-extrabold text-[#0c3e35]">
                          {task.completionPercentage}%
                        </span>
                      </div>

                      {/* Visual Bar: empty when 0%, gradient when > 0 */}
                      <div className="w-full h-2 bg-[#e2e1d8] rounded-full overflow-hidden">
                        {task.completionPercentage > 0 ? (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#0c3e35] to-[#d4af37] transition-all duration-300"
                            style={{ width: `${Math.min(100, task.completionPercentage)}%` }}
                          />
                        ) : (
                          <div className="h-full bg-transparent" style={{ width: '0%' }} />
                        )}
                      </div>

                      {task.completionNote && (
                        <div className="text-[11px] text-[#5e736e] pt-1.5 flex items-start gap-1.5 border-t border-[#e5e4dc]/70 mt-1">
                          <Info className="w-3.5 h-3.5 text-[#d4af37] shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-[#0c3e35]">آخر ملاحظة:</strong> {task.completionNote}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f0eee6]">
                      {isAlreadyAdded ? (
                        <div className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>مضافة لخطة اليوم</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectTask(task)}
                          className="flex-1 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold py-2.5 px-3 rounded-xl bg-[#0c3e35] text-white hover:bg-[#072923] transition cursor-pointer shadow-xs active:scale-98 border border-[#d4af37]/40"
                        >
                          <Plus className="w-4 h-4 text-[#d4af37]" />
                          <span>متابعة في خطة اليوم</span>
                        </button>
                      )}

                      {onDismissTask && !isAlreadyAdded && (
                        <button
                          type="button"
                          disabled={isDismissing}
                          onClick={(e) => handleDismiss(task.id, e)}
                          className="p-2.5 rounded-xl text-[#8daaa2] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer shrink-0"
                          title="إغلاق واستبعاد هذه المهمة نهائياً"
                        >
                          {isDismissing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-white/80 border-t border-[#d2d1c9] flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <span className="text-[11px] sm:text-xs text-[#5e736e] text-center sm:text-right">
            عند ترحيل المهمة، ستبدأ في خطة اليوم بنسبتها السابقة لتواصل رفعها تراكمياً.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] hover:bg-[#f4f3ed] transition cursor-pointer shadow-2xs shrink-0"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

