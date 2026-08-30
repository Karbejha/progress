'use client';

import React from 'react';
import { DirectorateOverviewItem } from '../types';
import { Shield, Anchor, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { DynamicIcon } from './Icons';

interface OrgHierarchyChartProps {
  directorates: DirectorateOverviewItem[];
  onSelectDirectorate: (item: DirectorateOverviewItem) => void;
}

export const OrgHierarchyChart: React.FC<OrgHierarchyChartProps> = ({
  directorates,
  onSelectDirectorate,
}) => {
  const getDir = (code: string) => directorates.find((d) => d.directorateCode === code);

  // Groupings matching the official hierarchy chart
  const row1Codes = ['DG_OFFICE', 'IMSAS', 'PSC', 'PLANNING', 'PR', 'TARTOUS_BRANCH'];
  const row2Codes = ['INTERNAL_AUDIT', 'SUPPLY', 'MORAL_GUIDANCE', 'MARITIME_EDU', 'FINANCE', 'INSPECTION', 'MAINTENANCE'];
  const row3Codes = ['FISHERIES_LICENSES', 'INFORMATICS', 'IT_INFRA', 'VEHICLES', 'ADMIN_DEV', 'LEGAL'];
  const row4Codes = ['PORT_AFFAIRS'];

  const renderNode = (code: string) => {
    const dir = getDir(code);
    if (!dir) return null;

    const isDone = dir.hasSummary;
    const inProgress = dir.hasPlan;
    const isUrgent = dir.urgentFlag;

    return (
      <div
        key={dir.directorateId}
        onClick={() => onSelectDirectorate(dir)}
        className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer text-center relative group flex flex-col justify-between shadow-xs hover:shadow-md ${
          isUrgent
            ? 'bg-red-50 border-red-300'
            : isDone
            ? 'bg-emerald-50/70 border-emerald-300'
            : inProgress
            ? 'bg-white border-[#0c3e35]/40 hover:border-[#0c3e35]'
            : 'bg-white border-[#d2d1c9] hover:border-slate-400'
        } hover:scale-[1.02]`}
      >
        {isUrgent && (
          <span className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white shadow-md animate-bounce">
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
        )}

        <div>
          <div className="w-9 h-9 rounded-xl bg-[#edece4] border border-[#d2d1c9] mx-auto mb-2 flex items-center justify-center text-[#0c3e35] group-hover:bg-[#0c3e35] group-hover:text-white transition">
            <DynamicIcon name={dir.icon} className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-[#0c3e35] line-clamp-2 leading-snug">
            {dir.directorateName}
          </h4>
        </div>

        <div className="mt-3 pt-2 border-t border-[#e5e4dc] flex items-center justify-between text-[11px]">
          <span className="font-extrabold text-[#0c3e35]">{dir.completionRate}%</span>
          {isDone ? (
            <span className="text-emerald-700 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" />
              منجز
            </span>
          ) : inProgress ? (
            <span className="text-[#0c3e35] font-bold flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              متابع
            </span>
          ) : (
            <span className="text-[#8daaa2]">بانتظار</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 p-6 sm:p-8 bg-[#edece4] rounded-[28px] border border-[#d2d1c9] shadow-brand-card">
      
      {/* Title & Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-5 border-b border-[#d2d1c9]">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[#0c3e35] flex items-center gap-2">
            <Anchor className="w-5 h-5 text-[#0c3e35]" />
            المخطط الهرمي الإداري اللحظي - المديرية العامة للموانئ
          </h3>
          <p className="text-xs text-[#5e736e] mt-1 font-medium">
            انقر على أي مديرية أو مكتب للاطلاع المباشر على الخطة اليومية وملخص الإنجاز.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-800 bg-emerald-100/70 px-3 py-1 rounded-xl border border-emerald-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            ملخص الإنجاز منجز
          </span>
          <span className="flex items-center gap-1.5 text-[#0c3e35] bg-white px-3 py-1 rounded-xl border border-[#0c3e35]/30 font-bold">
            <span className="w-2 h-2 rounded-full bg-[#0c3e35]" />
            الخطة قيد المتابعة
          </span>
          <span className="flex items-center gap-1.5 text-red-700 bg-red-100/70 px-3 py-1 rounded-xl border border-red-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            تنبيه عاجل
          </span>
          <span className="flex items-center gap-1.5 text-[#5e736e] bg-white px-3 py-1 rounded-xl border border-[#d2d1c9]">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            بانتظار الخطة
          </span>
        </div>
      </div>

      {/* Top Level: General Director */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-sm p-5 rounded-2xl bg-[#05261e] border-2 border-[#d4af37] shadow-xl text-center relative text-white">
          <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border-2 border-[#d4af37] mx-auto -mt-11 mb-2 flex items-center justify-center text-[#d4af37] shadow-md">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-white">المدير العام للمديرية العامة للموانئ</h3>
          <p className="text-xs text-[#d4af37] mt-0.5 font-bold">م. سامر الأحمد • الإشراف والقيادة المركزية</p>
          <div className="mt-2.5 text-[11px] text-[#edece4] bg-[#0c3e35] py-1 px-3.5 rounded-full inline-block border border-[#d4af37]/30 font-medium">
            معاون المدير العام: د. عمار الخليل
          </div>
        </div>

        {/* Tree Line Connector */}
        <div className="w-0.5 h-8 bg-[#0c3e35] my-1" />
        <div className="w-5/6 h-0.5 bg-[#0c3e35]/30 mb-6" />
      </div>

      {/* Level 1 Directorates & Offices */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-[#0c3e35] px-1">مكاتب الإدارة العليا والمستوى الأول:</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {row1Codes.map(renderNode)}
        </div>
      </div>

      {/* Level 2 Directorates */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-[#0c3e35] px-1">المديريات التخصصية والتنفيذية:</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {row2Codes.map(renderNode)}
        </div>
      </div>

      {/* Level 3 Directorates */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-[#0c3e35] px-1">المديريات الفنية والمساندة والشؤون القانونية:</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {row3Codes.map(renderNode)}
        </div>
      </div>

      {/* Level 4 Main Operations */}
      <div className="space-y-2.5 pt-3 border-t border-[#d2d1c9]">
        <h4 className="text-xs font-bold text-[#0c3e35] px-1">العمليات الميدانية وشؤون الموانئ:</h4>
        <div className="max-w-md mx-auto">
          {row4Codes.map(renderNode)}
        </div>
      </div>

    </div>
  );
};
