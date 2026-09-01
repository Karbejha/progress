'use client';

import React from 'react';
import { DirectorateOverviewItem } from '../types';
import { DynamicIcon } from './Icons';
import { CheckCircle2, Clock, AlertTriangle, MessageSquare, Eye } from 'lucide-react';

interface DirectorateCardProps {
  item: DirectorateOverviewItem;
  onSelect: (item: DirectorateOverviewItem) => void;
}

export const DirectorateCard: React.FC<DirectorateCardProps> = ({ item, onSelect }) => {
  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'OPERATIONAL':
        return { label: 'تشغيلية / بحرية', color: 'bg-[#0c3e35]/10 text-[#0c3e35] border-[#0c3e35]/20' };
      case 'ADMINISTRATIVE':
        return { label: 'إدارية وتنظيمية', color: 'bg-[#edece4] text-[#0c3e35] border-[#d2d1c9]' };
      case 'TECHNICAL':
        return { label: 'فنية وتقنية', color: 'bg-teal-50 text-teal-800 border-teal-200' };
      case 'LOGISTICS':
        return { label: 'دعم ولوجستيات', color: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'AUDIT_LEGAL':
        return { label: 'رقابة وشؤون قانونية', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'EXECUTIVE_OFFICE':
        return { label: 'مكتب تنفيذي', color: 'bg-[#d4af37]/20 text-[#8a7a52] border-[#d4af37]/40' };
      default:
        return { label: 'مديرية', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const catInfo = getCategoryLabel(item.category);

  return (
    <div
      onClick={() => onSelect(item)}
      className="bg-white border border-[#d2d1c9] rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-[#0c3e35] group flex flex-col justify-between"
    >
      {/* Top status indicator line */}
      <div
        className={`absolute top-0 right-0 left-0 h-1.5 transition-all ${
          item.urgentFlag
            ? 'bg-red-500'
            : item.hasSummary || (item.completionRate === 100 && item.tasksCount > 0)
            ? 'bg-emerald-600'
            : item.hasPlan || (item.executiveTasks && item.executiveTasks.length > 0 && item.completionRate > 0)
            ? 'bg-[#0c3e35]'
            : 'bg-[#d2d1c9]'
        }`}
      />

      <div>
        {/* Directorate Category & Urgent Alert */}
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${catInfo.color}`}>
            {catInfo.label}
          </span>

          {item.urgentFlag && (
            <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              تنبيه عاجل
            </span>
          )}
        </div>

        {/* Title & Icon */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-11 h-11 rounded-xl bg-[#edece4] border border-[#d2d1c9] flex items-center justify-center text-[#0c3e35] group-hover:bg-[#0c3e35] group-hover:text-white transition-all shadow-xs shrink-0">
            <DynamicIcon name={item.icon} className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[#0c3e35] group-hover:text-[#072923] transition line-clamp-2 leading-snug">
              {item.directorateName}
            </h3>
            <p className="text-xs text-[#5e736e] mt-1 font-medium">
              المدير المسؤول: {item.director?.fullName?.trim() ? (
                <strong className="text-[#0c3e35]">{item.director.fullName}</strong>
              ) : (
                <span className="text-[#8daaa2] font-normal">غير محدد</span>
              )}
            </p>
          </div>
        </div>

        {/* Daily Focus / Executive Tasks Preview */}
        {item.generalFocus ? (
          <div className="p-2.5 rounded-xl bg-[#edece4]/70 border border-[#e5e4dc] mb-4 text-xs text-[#0c3e35] line-clamp-2">
            <span className="text-[#0c3e35] font-bold ml-1">التركيز:</span>
            {item.generalFocus}
          </div>
        ) : item.executiveTasks && item.executiveTasks.length > 0 ? (
          <div className="p-2.5 rounded-xl bg-[#edece4]/70 border border-[#e5e4dc] mb-4 text-xs text-[#0c3e35] line-clamp-2">
            <span className="text-[#0c3e35] font-bold ml-1">التكليفات:</span>
            {item.executiveTasks.map((t) => t.title).join(' • ')}
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-[#edece4]/30 border border-[#e5e4dc] mb-4 text-xs text-[#8daaa2] italic">
            لم تسجل خطة صباحية بعد
          </div>
        )}
      </div>

      {/* Progress & Bottom Bar */}
      <div>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5e736e] flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0c3e35]" />
              المهام: <strong className="text-[#0c3e35]">{item.completedTasksCount}</strong> من <strong className="text-[#5e736e]">{item.tasksCount}</strong>
            </span>
            <span className="font-extrabold text-[#0c3e35]">
              {item.completionRate}% إنجاز
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-[#edece4] rounded-full overflow-hidden border border-[#d2d1c9]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                item.completionRate >= 80
                  ? 'bg-emerald-600'
                  : item.completionRate >= 40
                  ? 'bg-[#0c3e35]'
                  : item.hasPlan || (item.executiveTasks && item.executiveTasks.length > 0)
                  ? 'bg-[#d4af37]'
                  : 'bg-slate-300'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, item.completionRate))}%` }}
            />
          </div>
        </div>

        {/* Footer State & Action Button */}
        <div className="flex items-center justify-between pt-3 border-t border-[#e5e4dc] text-xs">
          <div className="flex items-center gap-1.5">
            {item.hasSummary ? (
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ملخص منجز
              </span>
            ) : item.hasPlan ? (
              <span className="flex items-center gap-1 text-[#0c3e35] font-bold">
                <Clock className="w-3.5 h-3.5" />
                قيد المتابعة
              </span>
            ) : item.executiveTasks && item.executiveTasks.length > 0 ? (
              item.completionRate === 100 ? (
                <span className="flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تكليفات منجزة
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[#0c3e35] font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  متابعة التكليفات
                </span>
              )
            ) : (
              <span className="text-[#8daaa2]">
                بانتظار الخطة
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {item.feedbacks && item.feedbacks.length > 0 && (
              <span className="flex items-center gap-1 text-[#8a7a52] bg-[#d4af37]/20 border border-[#d4af37]/40 px-2 py-0.5 rounded-md font-bold text-[11px]">
                <MessageSquare className="w-3 h-3" />
                {item.feedbacks.length}
              </span>
            )}
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white transition font-bold text-xs shadow-xs cursor-pointer">
              <Eye className="w-3.5 h-3.5" />
              <span>مراجعة وتوجيه</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
