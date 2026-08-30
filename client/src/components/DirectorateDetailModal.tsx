'use client';

import React, { useState } from 'react';
import { DirectorateOverviewItem } from '../types';
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

  if (!item) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#031814]/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
        
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
          
          {/* Top KPI Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex items-center justify-between shadow-xs">
              <span className="text-xs font-bold text-[#5e736e]">نسبة الإنجاز اليومي:</span>
              <span className="text-xl font-extrabold text-emerald-700">{item.completionRate}%</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex items-center justify-between shadow-xs">
              <span className="text-xs font-bold text-[#5e736e]">عدد المهام المخططة:</span>
              <span className="text-xl font-extrabold text-[#0c3e35]">{item.completedTasksCount} / {item.tasksCount}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex items-center justify-between shadow-xs">
              <span className="text-xs font-bold text-[#5e736e]">حالة التقرير:</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#edece4] text-[#0c3e35] border border-[#d2d1c9]">
                {item.statusTag}
              </span>
            </div>
          </div>

          {/* Section 1: Morning Plan & Tasks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-2">
              <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0c3e35]" />
                الخطة الصباحية والمهام المقررة
              </h3>
              {item.planSubmittedAt && (
                <span className="text-[11px] text-[#5e736e] font-medium">
                  وقت الإرسال: {new Date(item.planSubmittedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {item.generalFocus && (
              <div className="p-3.5 rounded-2xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35]">
                <strong className="font-bold ml-1">التركيز العام للخطة:</strong>
                {item.generalFocus}
              </div>
            )}

            {item.tasks && item.tasks.length > 0 ? (
              <div className="space-y-2.5">
                {item.tasks.map((task, idx) => (
                  <div
                    key={task.id || idx}
                    className="p-4 rounded-2xl bg-white border border-[#d2d1c9] space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#0c3e35] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-[#0c3e35] leading-tight">{task.title}</h4>
                          {task.description && (
                            <p className="text-xs text-[#5e736e] mt-1">{task.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {getPriorityBadge(task.priority)}
                        <span className="text-xs text-[#0c3e35] font-bold bg-[#edece4] px-2 py-0.5 rounded-lg border border-[#d2d1c9]">
                          {task.estimatedHours} س
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#e5e4dc] text-xs">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(task.status)}
                        <span className="text-[#5e736e]">إنجاز: <strong className="text-[#0c3e35] font-bold">{task.completionPercentage}%</strong></span>
                      </div>
                      {task.completionNote && (
                        <span className="text-[#0c3e35] text-[11px] bg-[#f4f3ed] px-2.5 py-0.5 rounded-md border border-[#d2d1c9] font-medium">
                          ملاحظة: {task.completionNote}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-[#5e736e] text-xs bg-white rounded-2xl border border-dashed border-[#d2d1c9]">
                لم يتم تسجيل مهام في الخطة الصباحية لهذا اليوم
              </div>
            )}
          </div>

          {/* Section 2: End-of-Day Summary */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-2">
              <h3 className="text-sm font-bold text-[#0c3e35] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af37]" />
                ملخص الإنجاز المسائي والتحديات
              </h3>
              {item.summarySubmittedAt && (
                <span className="text-[11px] text-[#5e736e] font-medium">
                  وقت الإرسال: {new Date(item.summarySubmittedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {item.hasSummary ? (
              <div className="space-y-3">
                {item.summaryText && (
                  <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] text-xs leading-relaxed text-[#0c3e35]">
                    <strong className="text-emerald-800 block mb-1 font-bold">ملخص الأعمال المنفذة:</strong>
                    {item.summaryText}
                  </div>
                )}

                {item.achievements && item.achievements.length > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs space-y-1.5">
                    <strong className="text-emerald-800 block mb-1 font-bold">أهم الإنجازات المحققة:</strong>
                    <ul className="list-disc list-inside space-y-1 text-emerald-900 font-medium">
                      {item.achievements.map((ach, i) => (
                        <li key={i}>{ach}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.challenges && (
                  <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                    <strong className="text-amber-800 block mb-1 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      المعوقات والتحديات التي واجهت المديرية:
                    </strong>
                    {item.challenges}
                  </div>
                )}

                {item.directorNotes && (
                  <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35]">
                    <strong className="text-[#0c3e35] block mb-1 font-bold">ملاحظات واحتياجات موجهة للمدير العام:</strong>
                    {item.directorNotes}
                  </div>
                )}

                {item.tomorrowPlanPreview && (
                  <div className="p-3.5 rounded-2xl bg-white border border-[#d2d1c9] text-xs text-[#0c3e35]">
                    <strong className="text-[#0c3e35] ml-1 font-bold">رؤية أولية لمهام الغد:</strong>
                    {item.tomorrowPlanPreview}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-[#5e736e] text-xs bg-white rounded-2xl border border-dashed border-[#d2d1c9]">
                بانتظار قيام مدير المديرية بتقديم ملخص إنجاز نهاية الدوام
              </div>
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
    </div>
  );
};
