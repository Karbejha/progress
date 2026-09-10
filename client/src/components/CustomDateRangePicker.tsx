'use client';

import React from 'react';
import { CustomDatePicker } from './CustomDatePicker';
import { CalendarRange, Sparkles, RotateCcw } from 'lucide-react';

export interface CustomDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}

const padZero = (n: number) => n.toString().padStart(2, '0');

const toIso = (d: Date) => {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

export const CustomDateRangePicker: React.FC<CustomDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  className = '',
}) => {
  const handleSelectLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    onChange(toIso(start), toIso(end));
  };

  const handleSelectLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    onChange(toIso(start), toIso(end));
  };

  const handleSelectThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    onChange(toIso(start), toIso(end));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-black/25 border border-white/10 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#d4af37] px-1 shrink-0">
        <CalendarRange className="w-3.5 h-3.5" />
        <span>النطاق:</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-gray-300 text-[11px] font-bold">من:</span>
        <CustomDatePicker
          value={startDate}
          onChange={(newStart) => onChange(newStart, endDate || newStart)}
          label=""
          placeholder="تاريخ البدء"
          className="!py-1 !px-2.5 !text-xs !bg-[#05261e]"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-gray-300 text-[11px] font-bold">إلى:</span>
        <CustomDatePicker
          value={endDate}
          onChange={(newEnd) => onChange(startDate || newEnd, newEnd)}
          minDate={startDate}
          label=""
          placeholder="تاريخ الانتهاء"
          className="!py-1 !px-2.5 !text-xs !bg-[#05261e]"
        />
      </div>

      {/* Quick presets */}
      <div className="flex items-center gap-1 mr-auto shrink-0">
        <button
          type="button"
          onClick={handleSelectLast7Days}
          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-bold transition cursor-pointer"
          title="تحديد آخر 7 أيام"
        >
          آخر 7 أيام
        </button>
        <button
          type="button"
          onClick={handleSelectLast30Days}
          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-bold transition cursor-pointer"
          title="تحديد آخر 30 يوماً"
        >
          آخر 30 يوم
        </button>
        <button
          type="button"
          onClick={handleSelectThisMonth}
          className="px-2 py-1 rounded-lg bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] border border-[#d4af37]/40 text-[10.5px] font-bold transition cursor-pointer"
          title="تحديد الشهر الحالي كاملاً"
        >
          هذا الشهر
        </button>
      </div>
    </div>
  );
};
