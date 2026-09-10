'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
  Shield,
  Layers,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';
import { DynamicIcon } from './Icons';

export interface NotificationDetailItem {
  id?: string;
  title: string;
  message: string;
  content?: string;
  type: 'task' | 'plan' | 'summary' | 'feedback' | 'announcement';
  time?: string;
  createdAt?: string;
  priority?: string;
  authorName?: string;
  authorTitle?: string;

  // Task / Executive task specific
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  directorateId?: string;
  directorateName?: string;
  directorateIcon?: string;
  completionPercentage?: number;
  completionNote?: string;
  taskStatus?: string;
  dueDate?: string;
  isShared?: boolean;

  // Plan specific
  tasksCount?: number;
  planSubmittedAt?: string;

  // Summary specific
  completionRate?: number;
  urgentFlag?: boolean;
  notes?: string;

  fullPayload?: any;
}

interface NotificationDetailsModalProps {
  data: NotificationDetailItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenTasksModal?: (taskId?: string, directorateId?: string, taskTitle?: string) => void;
  onOpenDirectorateDetail?: (directorateId?: string) => void;
}

export const NotificationDetailsModal: React.FC<NotificationDetailsModalProps> = ({
  data,
  isOpen,
  onClose,
  onOpenTasksModal,
  onOpenDirectorateDetail,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !data) return;

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
  }, [isOpen, data, onClose]);

  if (!mounted || !isOpen || !data) return null;

  // Extract parsed fields with high-reliability fallbacks
  const payload = data.fullPayload || {};
  const isTaskType = data.type === 'task';
  const isPlanType = data.type === 'plan';
  const isSummaryType = data.type === 'summary';

  // Task details parsing
  const taskTitle =
    data.taskTitle ||
    payload.task?.title ||
    payload.title ||
    data.message?.match(/التكليف "(.*?)"/)?.[1] ||
    data.title;

  const directorateName =
    data.directorateName ||
    payload.directorateName ||
    payload.directorate?.name ||
    data.message?.match(/قامت \((.*?)\)/)?.[1] ||
    data.message?.match(/قامت (.*?) باعتماد/)?.[1] ||
    data.message?.match(/سلّمت (.*?) ملخص/)?.[1] ||
    'المديرية المعنية';

  const directorateId =
    data.directorateId ||
    payload.directorateId ||
    payload.directorate?.id ||
    payload.task?.directorateId;

  const taskId =
    data.taskId ||
    payload.task?.id ||
    payload.taskId ||
    payload.id;

  const completionPercentage =
    data.completionPercentage ??
    payload.task?.completionPercentage ??
    payload.completionPercentage ??
    (data.message?.match(/إلى \((\d+)%\)/)?.[1]
      ? Number(data.message.match(/إلى \((\d+)%\)/)?.[1])
      : undefined);

  const completionNote =
    data.completionNote ||
    payload.task?.completionNote ||
    payload.completionNote ||
    '';

  const taskDescription =
    data.taskDescription ||
    payload.task?.description ||
    payload.description ||
    '';

  const priority =
    data.priority ||
    payload.task?.priority ||
    payload.priority ||
    'NORMAL';

  const status =
    data.taskStatus ||
    payload.task?.status ||
    payload.status ||
    (completionPercentage === 100 ? 'COMPLETED' : completionPercentage && completionPercentage > 0 ? 'IN_PROGRESS' : 'PENDING');

  const dueDate =
    data.dueDate ||
    payload.task?.dueDate ||
    payload.dueDate;

  const isShared =
    data.isShared ??
    payload.task?.isShared ??
    payload.isShared ??
    false;

  // Plan details parsing
  const tasksCount =
    data.tasksCount ??
    payload.tasksCount ??
    (data.message?.match(/\((\d+) مهام\)/)?.[1]
      ? Number(data.message.match(/\((\d+) مهام\)/)?.[1])
      : undefined);

  // Summary details parsing
  const completionRate =
    data.completionRate ??
    payload.completionRate ??
    payload.overallCompletionRate ??
    (data.message?.match(/بنسبة (?:إنجاز )?(\d+)%/)?.[1]
      ? Number(data.message.match(/بنسبة (?:إنجاز )?(\d+)%/)?.[1])
      : undefined);

  const urgentFlag =
    data.urgentFlag ??
    payload.urgentFlag ??
    false;

  const formattedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('ar-SY', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : data.time || 'اليوم';

  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('ar-SY', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleGoToTasksBoard = () => {
    onClose();
    if (onOpenTasksModal) {
      onOpenTasksModal(taskId, directorateId, taskTitle);
    } else {
      window.dispatchEvent(
        new CustomEvent('ports:open_tasks_modal', {
          detail: { taskId, directorateId, searchQuery: taskTitle },
        })
      );
    }
  };

  const handleGoToDirectorate = () => {
    onClose();
    if (onOpenDirectorateDetail) {
      onOpenDirectorateDetail(directorateId);
    } else {
      window.dispatchEvent(
        new CustomEvent('ports:open_directorate_detail', {
          detail: { directorateId },
        })
      );
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Official Header */}
        <div className="p-5 sm:p-6 bg-[#05261e] text-white flex items-center justify-between border-b border-[#0c3e35] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-1.5 shadow-md shrink-0">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار المديرية العامة للموانئ"
                width={36}
                height={36}
                className="object-contain w-auto h-auto"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                  المديرية العامة للموانئ • نظام المتابعة اللحظية
                </span>
              </div>
              <h2 className="text-sm sm:text-base md:text-lg font-extrabold text-white tracking-tight mt-1">
                {isTaskType && 'تفاصيل إنجاز ومتابعة التكليف الإداري'}
                {isPlanType && 'تفاصيل الخطة الصباحية المعتمدة'}
                {isSummaryType && 'تفاصيل ملخص الإنجاز ونهاية الدوام'}
                {!isTaskType && !isPlanType && !isSummaryType && (data.title || 'تفاصيل الإشعار الرسمي')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-7 space-y-5 overflow-y-auto flex-1 bg-[#edece4]">
          {/* Metadata Top Bar */}
          <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[#0c3e35] font-bold">
                <Building2 className="w-4 h-4 text-[#d4af37]" />
                <span>الجهة المسؤولة: <strong>{directorateName}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-[#5e736e]">
                <Clock className="w-4 h-4 text-[#8daaa2]" />
                <span>تاريخ وتوقيت الإشعار: {formattedDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isShared && (
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-xl bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/40 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>تكليف مشترك</span>
                </span>
              )}
              {priority === 'URGENT' ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>عاجل جداً</span>
                </span>
              ) : priority === 'HIGH' ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 border border-amber-300">
                  أولوية مرتفعة
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-xl bg-[#edece4] text-[#0c3e35] border border-[#d2d1c9]">
                  أولوية عادية
                </span>
              )}

              {status === 'COMPLETED' ? (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>مكتمل</span>
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-100 text-blue-800 border border-blue-300">
                  قيد العمل
                </span>
              )}
            </div>
          </div>

          {/* MAIN DETAILS PANEL */}
          {isTaskType && (
            <div className="space-y-4">
              {/* Task Title & Primary Card */}
              <div className="p-5 sm:p-6 rounded-[22px] bg-white border-2 border-[#0c3e35]/30 space-y-4 shadow-sm relative overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-[#edece4] pb-3">
                  <div>
                    <span className="text-[11px] font-bold text-[#d4af37] block mb-1">
                      عنوان التكليف المسند:
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-[#0c3e35] leading-snug">
                      {taskTitle}
                    </h3>
                  </div>
                  {dueDateStr && (
                    <div className="shrink-0 text-left bg-[#f4f3ed] p-2 rounded-xl border border-[#d2d1c9] text-[11px]">
                      <span className="text-[#5e736e] block">تاريخ الاستحقاق:</span>
                      <strong className="text-[#0c3e35] flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-[#d4af37]" />
                        {dueDateStr}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Progress Bar with Percentage */}
                {completionPercentage !== undefined && (
                  <div className="space-y-2 bg-[#f4f3ed] p-4 rounded-xl border border-[#d2d1c9]">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#0c3e35] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#d4af37]" />
                        <span>نسبة الإنجاز المحققة من قبل المديرية:</span>
                      </span>
                      <span
                        className={`text-base font-black ${
                          completionPercentage === 100
                            ? 'text-emerald-700'
                            : completionPercentage > 50
                            ? 'text-blue-700'
                            : 'text-[#0c3e35]'
                        }`}
                      >
                        {completionPercentage}%
                      </span>
                    </div>

                    <div className="w-full h-3 bg-[#d2d1c9]/70 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          completionPercentage === 100
                            ? 'bg-emerald-600'
                            : completionPercentage > 50
                            ? 'bg-blue-600'
                            : 'bg-[#d4af37]'
                        }`}
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Directorate Completion Notes (if provided by director) */}
                {completionNote && (
                  <div className="space-y-1.5 bg-amber-50/70 p-4 rounded-xl border border-amber-200">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-amber-700" />
                      <span>ملاحظات وإيضاحات المديرية حول التحديث:</span>
                    </span>
                    <p className="text-xs text-[#0c3e35] font-medium leading-relaxed whitespace-pre-line pt-1">
                      {completionNote}
                    </p>
                  </div>
                )}

                {/* Original Task Description */}
                {taskDescription && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-bold text-[#5e736e] block">
                      نص وتوجيهات التكليف الأصلي:
                    </span>
                    <div className="p-3.5 rounded-xl bg-[#fcfbf7] border border-[#edece4] text-xs text-[#0c3e35] leading-relaxed whitespace-pre-line">
                      {taskDescription}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PLAN DETAILS PANEL */}
          {isPlanType && (
            <div className="p-6 rounded-[22px] bg-white border-2 border-[#0c3e35]/30 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[#edece4] pb-3">
                <FileText className="w-5 h-5 text-[#d4af37]" />
                <h3 className="text-base font-extrabold text-[#0c3e35]">
                  اعتماد ورفع الخطة اليومية
                </h3>
              </div>
              <p className="text-xs text-[#0c3e35] leading-relaxed">
                قامت <strong>{directorateName}</strong> باعتماد ورفع خطتها الصباحية بنجاح إلى منظومة المتابعة اليومية.
              </p>
              {tasksCount !== undefined && (
                <div className="p-4 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0c3e35]">إجمالي عدد المهام المعتمدة في الخطة:</span>
                  <span className="text-sm font-black text-[#0c3e35] px-3 py-1 bg-white rounded-lg border border-[#d2d1c9]">
                    {tasksCount} مهام
                  </span>
                </div>
              )}
            </div>
          )}

          {/* SUMMARY DETAILS PANEL */}
          {isSummaryType && (
            <div className="p-6 rounded-[22px] bg-white border-2 border-[#0c3e35]/30 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[#edece4] pb-3">
                <Sparkles className="w-5 h-5 text-[#d4af37]" />
                <h3 className="text-base font-extrabold text-[#0c3e35]">
                  تسليم ملخص نهاية الدوام والإنجاز
                </h3>
              </div>
              <p className="text-xs text-[#0c3e35] leading-relaxed">
                سلّمت <strong>{directorateName}</strong> ملخص إنجاز نهاية الدوام الرسمي.
              </p>
              {completionRate !== undefined && (
                <div className="space-y-2 bg-[#f4f3ed] p-4 rounded-xl border border-[#d2d1c9]">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#0c3e35]">نسبة الإنجاز الكلية للمديرية:</span>
                    <span className="text-base font-black text-[#0c3e35]">{completionRate}%</span>
                  </div>
                  <div className="w-full h-3 bg-[#d2d1c9]/70 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>
              )}
              {urgentFlag && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>تنبيه: يتضمن هذا الملخص إشارة لموضوع طارئ يستدعي الاطلاع الفوري.</span>
                </div>
              )}
            </div>
          )}

          {/* GENERAL NOTIFICATION PANEL */}
          {!isTaskType && !isPlanType && !isSummaryType && (
            <div className="p-6 rounded-[22px] bg-white border border-[#d2d1c9] space-y-3">
              <h3 className="text-base font-extrabold text-[#0c3e35]">{data.title}</h3>
              <p className="text-xs text-[#0c3e35] leading-relaxed whitespace-pre-line">
                {data.content || data.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#d2d1c9] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {isTaskType && (
              <button
                type="button"
                onClick={handleGoToTasksBoard}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
              >
                <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>الانتقال إلى جدول التكاليف الإدارية الكامل</span>
              </button>
            )}

            {directorateId && (
              <button
                type="button"
                onClick={handleGoToDirectorate}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#edece4] hover:bg-[#dfded6] text-[#0c3e35] border border-[#d2d1c9] text-xs font-bold transition cursor-pointer active:scale-95"
              >
                <Building2 className="w-3.5 h-3.5 text-[#0c3e35]" />
                <span>عرض ملف وبيانات ({directorateName})</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
