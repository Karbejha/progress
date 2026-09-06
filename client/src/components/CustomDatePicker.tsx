'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';

export interface CustomDatePickerProps {
  value: string; // Format: YYYY-MM-DD or full ISO string
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  variant?: 'default' | 'badge' | 'input';
  badgeStatus?: 'overdue' | 'today' | 'normal' | 'none';
  allowClear?: boolean;
  onClear?: () => void;
}

const ARABIC_MONTHS = [
  'كانون الثاني (1)',
  'شباط (2)',
  'آذار (3)',
  'نيسان (4)',
  'أيار (5)',
  'حزيران (6)',
  'تموز (7)',
  'آب (8)',
  'أيلول (9)',
  'تشرين الأول (10)',
  'تشرين الثاني (11)',
  'كانون الأول (12)',
];

const ARABIC_MONTHS_NAMES = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

const ARABIC_WEEKDAYS = [
  { key: 'sun', label: 'أحد', isWeekend: false },
  { key: 'mon', label: 'إثنين', isWeekend: false },
  { key: 'tue', label: 'ثلاثاء', isWeekend: false },
  { key: 'wed', label: 'أربعاء', isWeekend: false },
  { key: 'thu', label: 'خميس', isWeekend: false },
  { key: 'fri', label: 'جمعة', isWeekend: true },
  { key: 'sat', label: 'سبت', isWeekend: true },
];

// Helper to pad single digits with leading zero
const padZero = (num: number) => num.toString().padStart(2, '0');

// Helper to get formatted ISO string YYYY-MM-DD from year, month (0-11), day (1-31)
const toIsoString = (year: number, month: number, day: number) => {
  return `${year}-${padZero(month + 1)}-${padZero(day)}`;
};

// Helper to get today's date in local time YYYY-MM-DD
const getTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
};

// Helper to get yesterday's date in local time YYYY-MM-DD
const getYesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

// Helper to get tomorrow's date in local time YYYY-MM-DD
const getTomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  label = 'التاريخ:',
  placeholder,
  className = '',
  disabled = false,
  minDate,
  maxDate,
  variant = 'default',
  badgeStatus = 'normal',
  allowClear = false,
  onClear,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');

  // Normalize value to clean YYYY-MM-DD
  const cleanValue = React.useMemo(() => {
    if (!value) return '';
    const str = String(value).trim();
    if (!str) return '';
    return str.includes('T') ? str.split('T')[0] : str;
  }, [value]);

  // Parse current value or fallback to today
  const parsedDate = React.useMemo(() => {
    if (!cleanValue) return new Date();
    const [y, m, d] = cleanValue.split('-').map(Number);
    if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
    return new Date(y, m - 1, d);
  }, [cleanValue]);

  // The month & year currently displayed in the calendar view
  const [viewYear, setViewYear] = useState<number>(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.getMonth());
  const [yearRangeStart, setYearRangeStart] = useState<number>(
    Math.floor(parsedDate.getFullYear() / 12) * 12
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // When value changes from outside, sync view
  useEffect(() => {
    if (cleanValue) {
      const [y, m] = cleanValue.split('-').map(Number);
      if (y && m && !isNaN(y) && !isNaN(m)) {
        setViewYear(y);
        setViewMonth(m - 1);
        setYearRangeStart(Math.floor(y / 12) * 12);
      }
    }
  }, [cleanValue]);

  // Update popup positioning relative to trigger (for desktop popover)
  const updatePosition = () => {
    if (!triggerRef.current || isMobile) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(356, window.innerWidth - 32);
    const popoverHeight = 455;
    const padding = 16;

    // Right-aligned for RTL
    let left = rect.right - popoverWidth;
    if (left < padding) left = padding;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }

    let top = rect.bottom + 8;
    // If popover overflows the bottom, place it above the button
    if (top + popoverHeight > window.innerHeight) {
      if (rect.top > popoverHeight + padding) {
        top = rect.top - popoverHeight - 8;
      } else {
        top = Math.max(padding, window.innerHeight - popoverHeight - padding);
      }
    }

    setPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      zIndex: 99999,
    });
  };

  useLayoutEffect(() => {
    if (isOpen && !isMobile) {
      updatePosition();
    }
  }, [isOpen, viewMode, viewMonth, viewYear, isMobile]);

  // Handle outside click & window resize/scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setViewMode('days');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setViewMode('days');
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  // Navigation handlers
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (dayIso: string) => {
    onChange(dayIso);
    setIsOpen(false);
    setViewMode('days');
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = getTodayIso();
    onChange(today);
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setIsOpen(false);
    setViewMode('days');
  };

  const handleSelectTomorrow = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tomorrow = getTomorrowIso();
    onChange(tomorrow);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(false);
    setViewMode('days');
  };

  const handleSelectYesterday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const yesterday = getYesterdayIso();
    onChange(yesterday);
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(false);
    setViewMode('days');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (onClear) onClear();
    setIsOpen(false);
    setViewMode('days');
  };

  // Generate day matrix for viewMonth / viewYear
  const calendarDays = React.useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const firstDayIndex = firstDay.getDay(); // 0 = Sun, 1 = Mon ...
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      iso: string;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const todayIso = getTodayIso();

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = toIsoString(y, m, d);
      days.push({
        day: d,
        month: m,
        year: y,
        iso,
        isCurrentMonth: false,
        isSelected: iso === cleanValue,
        isToday: iso === todayIso,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toIsoString(viewYear, viewMonth, d);
      days.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        iso,
        isCurrentMonth: true,
        isSelected: iso === cleanValue,
        isToday: iso === todayIso,
      });
    }

    // Next month starting days (to complete 35 or 42 grid cells)
    const totalCells = days.length > 35 ? 42 : 35;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const iso = toIsoString(y, m, d);
      days.push({
        day: d,
        month: m,
        year: y,
        iso,
        isCurrentMonth: false,
        isSelected: iso === cleanValue,
        isToday: iso === todayIso,
      });
    }

    return days;
  }, [viewYear, viewMonth, cleanValue]);

  // Format display value for the button
  const formattedDisplay = React.useMemo(() => {
    if (!cleanValue) {
      if (placeholder) return placeholder;
      if (variant === 'badge') return '+ موعد';
      return 'تحديد التاريخ';
    }
    const [y, m, d] = cleanValue.split('-');
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (isNaN(mNum) || isNaN(dNum)) return cleanValue;
    return `${y}/${mNum}/${dNum}`;
  }, [cleanValue, placeholder, variant]);

  const todayIso = getTodayIso();
  const isSelectedToday = cleanValue === todayIso;

  return (
    <div className="relative inline-block text-right">
      {/* Trigger Button: Badge Variant (for Task Cards) */}
      {variant === 'badge' && (
        <button
          type="button"
          ref={triggerRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(!isOpen);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`
            flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer select-none
            hover:shadow-xs hover:scale-105 active:scale-95
            ${isOpen ? 'ring-2 ring-[#0c3e35]/30 shadow-xs' : ''}
            ${
              badgeStatus === 'overdue'
                ? 'bg-red-50 text-red-700 border-red-200 font-black animate-pulse'
                : badgeStatus === 'today'
                ? 'bg-amber-50 text-amber-800 border-amber-200 font-extrabold'
                : cleanValue
                ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70'
                : 'border-dashed border-slate-300 hover:border-[#0c3e35] text-slate-400 hover:text-[#0c3e35] bg-slate-50/50 hover:bg-white'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            ${className}
          `}
          title={cleanValue ? 'انقر لتعديل موعد الاستحقاق' : 'انقر لإضافة موعد استحقاق للمهمة'}
        >
          <CalendarIcon className={`w-3 h-3 ${badgeStatus === 'overdue' ? 'text-red-600' : 'opacity-70'}`} />
          <span>
            {badgeStatus === 'overdue'
              ? `متأخرة (${formattedDisplay})`
              : badgeStatus === 'today'
              ? `اليوم (${formattedDisplay})`
              : formattedDisplay}
          </span>
          <ChevronDown
            className={`w-2.5 h-2.5 opacity-60 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {/* Trigger Button: Input Variant (for Forms and Modals) */}
      {variant === 'input' && (
        <button
          type="button"
          ref={triggerRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(!isOpen);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`
            flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#d2d1c9] text-[#05261e] 
            hover:border-[#0c3e35] focus:outline-hidden focus:ring-2 focus:ring-[#0c3e35] transition cursor-pointer select-none
            ${isOpen ? 'border-[#0c3e35] ring-2 ring-[#0c3e35]/20 shadow-xs' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            ${className}
          `}
          title="انقر لاختيار التاريخ من الروزنامة"
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="w-3.5 h-3.5 text-[#0c3e35] shrink-0" />
            <span className={cleanValue ? 'text-[#05261e] tracking-wide' : 'text-slate-400 font-normal'}>
              {cleanValue ? formattedDisplay : (placeholder || 'اختر التاريخ')}
            </span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#0c3e35]' : ''
            }`}
          />
        </button>
      )}

      {/* Trigger Button: Default Variant (for Dashboard Header) */}
      {variant === 'default' && (
        <button
          type="button"
          ref={triggerRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`
            flex items-center gap-2.5 bg-[#0c3e35] hover:bg-[#0e483e] 
            border ${isOpen ? 'border-[#d4af37] ring-2 ring-[#d4af37]/30 shadow-md' : 'border-[#d4af37]/40 hover:border-[#d4af37]/80'} 
            px-3.5 py-2 rounded-xl text-xs text-white cursor-pointer select-none 
            transition-all duration-200 shadow-xs group active:scale-[0.98]
            ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            ${className}
          `}
          title="انقر لتحديد أو تغيير التاريخ"
        >
          <div className="p-1 rounded-lg bg-[#05261e] border border-[#d4af37]/30 text-[#d4af37] group-hover:border-[#d4af37]/60 group-hover:scale-105 transition-all shrink-0">
            <CalendarIcon className="w-3.5 h-3.5" />
          </div>

          {label && <span className="font-bold text-gray-200 shrink-0">{label}</span>}

          <span
            className="font-bold text-[#d4af37] tracking-wider text-[13px] dir-ltr shrink-0"
            style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
          >
            {formattedDisplay}
          </span>

          {isSelectedToday && (
            <span className="text-[10px] bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/40 px-2 py-0.5 rounded-md font-extrabold shrink-0">
              اليوم
            </span>
          )}

          <ChevronDown
            className={`w-3.5 h-3.5 text-[#d4af37] transition-transform duration-300 shrink-0 ${
              isOpen ? 'rotate-180 text-white' : ''
            }`}
          />
        </button>
      )}

      {/* Popover / Dropdown Modal via Portal */}
      {mounted &&
        isOpen &&
        createPortal(
          isMobile ? (
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => {
                setIsOpen(false);
                setViewMode('days');
              }}
            >
              <div
                ref={popoverRef}
                style={{ backgroundColor: '#05261e' }}
                className="w-full max-w-[350px] border-2 border-[#d4af37]/70 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),0_0_30px_rgba(212,175,55,0.25)] text-white p-4 sm:p-5 select-none overflow-hidden animate-in zoom-in-95 duration-150"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header: Month / Year / Nav Buttons */}
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#0c3e35] relative z-10">
                  {viewMode === 'days' && (
                    <>
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-2 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/70 transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="الشهر السابق"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewMode('months')}
                          className="px-3 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-sm font-extrabold text-white hover:text-[#d4af37] border border-[#d4af37]/30 hover:border-[#d4af37]/60 transition-all cursor-pointer shadow-xs"
                        >
                          {ARABIC_MONTHS_NAMES[viewMonth]}
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('years')}
                          className="px-3 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-sm font-extrabold text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/60 transition-all cursor-pointer shadow-xs"
                          style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                        >
                          {viewYear}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-2 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/70 transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="الشهر القادم"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {viewMode === 'months' && (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-[#d4af37]">اختر الشهر ({viewYear})</span>
                      <button
                        type="button"
                        onClick={() => setViewMode('days')}
                        className="text-xs text-white hover:text-[#d4af37] font-bold px-2.5 py-1 rounded-lg bg-[#0c3e35] border border-[#d4af37]/30 transition cursor-pointer"
                      >
                        العودة للأيام
                      </button>
                    </div>
                  )}

                  {viewMode === 'years' && (
                    <div className="flex items-center justify-between w-full">
                      <button
                        type="button"
                        onClick={() => setYearRangeStart((prev) => prev - 12)}
                        className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 cursor-pointer transition"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xs font-bold text-white tracking-wider"
                        style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                      >
                        {yearRangeStart} - {yearRangeStart + 11}
                      </span>
                      <button
                        type="button"
                        onClick={() => setYearRangeStart((prev) => prev + 12)}
                        className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 cursor-pointer transition"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* View Mode 1: Days Grid */}
                {viewMode === 'days' && (
                  <div className="relative z-10">
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2 text-center border-b border-[#0c3e35] pb-1.5">
                      {ARABIC_WEEKDAYS.map((w) => (
                        <div
                          key={w.key}
                          className={`text-[11px] font-bold py-0.5 ${
                            w.isWeekend ? 'text-[#d4af37]' : 'text-[#8daaa2]'
                          }`}
                        >
                          {w.label}
                        </div>
                      ))}
                    </div>

                    {/* Days matrix */}
                    <div className="grid grid-cols-7 gap-1.5 text-center place-items-center">
                      {calendarDays.map((item) => {
                        const isSelected = item.isSelected;
                        const isToday = item.isToday;

                        return (
                          <button
                            key={item.iso}
                            type="button"
                            onClick={() => handleSelectDay(item.iso)}
                            className={`
                              w-9 h-9 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center relative cursor-pointer
                              ${
                                isSelected
                                  ? 'bg-[#d4af37] text-[#05261e] font-black shadow-lg shadow-[#d4af37]/50 ring-2 ring-[#d4af37] scale-105 z-10'
                                  : item.isCurrentMonth
                                  ? 'text-white hover:bg-[#0c3e35] hover:text-[#d4af37] hover:border hover:border-[#d4af37]/40'
                                  : 'text-[#2a544b] opacity-35 hover:opacity-90 hover:text-gray-300 hover:bg-[#0c3e35]/30'
                              }
                              ${isToday && !isSelected ? 'border-2 border-[#d4af37] text-[#d4af37] bg-[#0c3e35] font-extrabold' : ''}
                            `}
                          >
                            <span
                              className="leading-none text-[13px] font-bold"
                              style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                            >
                              {item.day}
                            </span>
                            {isToday && !isSelected && (
                              <span className="w-1 h-1 rounded-full bg-[#d4af37] absolute bottom-1"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* View Mode 2: Months Grid */}
                {viewMode === 'months' && (
                  <div className="grid grid-cols-3 gap-2 py-2 relative z-10">
                    {ARABIC_MONTHS.map((name, index) => {
                      const isCurrent = viewMonth === index;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setViewMonth(index);
                            setViewMode('days');
                          }}
                          className={`
                            p-2.5 rounded-xl text-xs font-bold transition text-center cursor-pointer
                            ${
                              isCurrent
                                ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                                : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                            }
                          `}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* View Mode 3: Years Grid */}
                {viewMode === 'years' && (
                  <div className="grid grid-cols-3 gap-2 py-2 relative z-10">
                    {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((y) => {
                      const isCurrent = viewYear === y;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setViewYear(y);
                            setViewMode('months');
                          }}
                          className={`
                            p-2.5 rounded-xl text-xs font-extrabold transition text-center cursor-pointer
                            ${
                              isCurrent
                                ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                                : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                            }
                          `}
                          style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                        >
                          {y}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Footer / Quick Actions */}
                <div className="mt-3 pt-3 border-t border-[#0c3e35] flex items-center justify-between gap-2 relative z-10 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectToday}
                      className="px-2.5 py-1.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-[11px] font-black transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                      title="تحديد موعد اليوم"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>اليوم</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectTomorrow}
                      className="px-2.5 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 hover:border-[#d4af37]/80 text-[#d4af37] text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                      title="تحديد موعد الغد"
                    >
                      <span>غداً</span>
                    </button>

                    {variant === 'default' && (
                      <button
                        type="button"
                        onClick={handleSelectYesterday}
                        className="px-2.5 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 hover:border-[#d4af37]/80 text-[#d4af37] text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>أمس</span>
                      </button>
                    )}

                    {allowClear && cleanValue && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="px-2.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 hover:text-white text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                        title="إلغاء موعد المهمة"
                      >
                        <X className="w-3 h-3" />
                        <span>مسح</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setViewMode('days');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#0c3e35]/60 hover:bg-[#0c3e35] border border-transparent hover:border-[#d4af37]/30 text-gray-300 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={popoverRef}
              style={{
                ...popoverStyle,
                backgroundColor: '#05261e',
                padding: '18px 20px',
              }}
              className="border-2 border-[#d4af37]/70 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),0_0_30px_rgba(212,175,55,0.25)] text-white p-5 animate-fadeIn select-none overflow-hidden"
              dir="rtl"
            >
              {/* Header: Month / Year / Nav Buttons */}
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#0c3e35] relative z-10">
                {viewMode === 'days' && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-2 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/70 transition-all active:scale-95 cursor-pointer shadow-xs"
                      title="الشهر السابق"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewMode('months')}
                        className="px-3 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-sm font-extrabold text-white hover:text-[#d4af37] border border-[#d4af37]/30 hover:border-[#d4af37]/60 transition-all cursor-pointer shadow-xs"
                      >
                        {ARABIC_MONTHS_NAMES[viewMonth]}
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('years')}
                        className="px-3 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-sm font-extrabold text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/60 transition-all cursor-pointer shadow-xs"
                        style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                      >
                        {viewYear}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="p-2 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] hover:text-white border border-[#d4af37]/30 hover:border-[#d4af37]/70 transition-all active:scale-95 cursor-pointer shadow-xs"
                      title="الشهر القادم"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </>
                )}

                {viewMode === 'months' && (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-[#d4af37]">اختر الشهر ({viewYear})</span>
                    <button
                      type="button"
                      onClick={() => setViewMode('days')}
                      className="text-xs text-white hover:text-[#d4af37] font-bold px-2.5 py-1 rounded-lg bg-[#0c3e35] border border-[#d4af37]/30 transition cursor-pointer"
                    >
                      العودة للأيام
                    </button>
                  </div>
                )}

                {viewMode === 'years' && (
                  <div className="flex items-center justify-between w-full">
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev - 12)}
                      className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 cursor-pointer transition"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <span
                      className="text-xs font-bold text-white tracking-wider"
                      style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                    >
                      {yearRangeStart} - {yearRangeStart + 11}
                    </span>
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev + 12)}
                      className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 cursor-pointer transition"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* View Mode 1: Days Grid */}
              {viewMode === 'days' && (
                <div className="relative z-10">
                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 gap-1 mb-2 text-center border-b border-[#0c3e35] pb-1.5">
                    {ARABIC_WEEKDAYS.map((w) => (
                      <div
                        key={w.key}
                        className={`text-[11px] font-bold py-0.5 ${
                          w.isWeekend ? 'text-[#d4af37]' : 'text-[#8daaa2]'
                        }`}
                      >
                        {w.label}
                      </div>
                    ))}
                  </div>

                  {/* Days matrix */}
                  <div className="grid grid-cols-7 gap-1.5 text-center place-items-center">
                    {calendarDays.map((item) => {
                      const isSelected = item.isSelected;
                      const isToday = item.isToday;

                      return (
                        <button
                          key={item.iso}
                          type="button"
                          onClick={() => handleSelectDay(item.iso)}
                          className={`
                            w-9 h-9 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center relative cursor-pointer
                            ${
                              isSelected
                                ? 'bg-[#d4af37] text-[#05261e] font-black shadow-lg shadow-[#d4af37]/50 ring-2 ring-[#d4af37] scale-105 z-10'
                                : item.isCurrentMonth
                                ? 'text-white hover:bg-[#0c3e35] hover:text-[#d4af37] hover:border hover:border-[#d4af37]/40'
                                : 'text-[#2a544b] opacity-35 hover:opacity-90 hover:text-gray-300 hover:bg-[#0c3e35]/30'
                            }
                            ${isToday && !isSelected ? 'border-2 border-[#d4af37] text-[#d4af37] bg-[#0c3e35] font-extrabold' : ''}
                          `}
                        >
                          <span
                            className="leading-none text-[13px] font-bold"
                            style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                          >
                            {item.day}
                          </span>
                          {isToday && !isSelected && (
                            <span className="w-1 h-1 rounded-full bg-[#d4af37] absolute bottom-1"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View Mode 2: Months Grid */}
              {viewMode === 'months' && (
                <div className="grid grid-cols-3 gap-2 py-2 relative z-10">
                  {ARABIC_MONTHS.map((name, index) => {
                    const isCurrent = viewMonth === index;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setViewMonth(index);
                          setViewMode('days');
                        }}
                        className={`
                          p-2.5 rounded-xl text-xs font-bold transition text-center cursor-pointer
                          ${
                            isCurrent
                              ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                              : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                          }
                        `}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* View Mode 3: Years Grid */}
              {viewMode === 'years' && (
                <div className="grid grid-cols-3 gap-2 py-2 relative z-10">
                  {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((y) => {
                    const isCurrent = viewYear === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setViewYear(y);
                          setViewMode('months');
                        }}
                        className={`
                          p-2.5 rounded-xl text-xs font-extrabold transition text-center cursor-pointer
                          ${
                            isCurrent
                              ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                              : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                          }
                        `}
                        style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Footer / Quick Actions */}
              <div className="mt-3 pt-3 border-t border-[#0c3e35] flex items-center justify-between gap-2 relative z-10 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectToday}
                    className="px-2.5 py-1.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-[11px] font-black transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                    title="تحديد موعد اليوم"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>اليوم</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectTomorrow}
                    className="px-2.5 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 hover:border-[#d4af37]/80 text-[#d4af37] text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                    title="تحديد موعد الغد"
                  >
                    <span>غداً</span>
                  </button>

                  {variant === 'default' && (
                    <button
                      type="button"
                      onClick={handleSelectYesterday}
                      className="px-2.5 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 hover:border-[#d4af37]/80 text-[#d4af37] text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>أمس</span>
                    </button>
                  )}

                  {allowClear && cleanValue && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="px-2.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 hover:text-white text-[11px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                      title="إلغاء موعد المهمة"
                    >
                      <X className="w-3 h-3" />
                      <span>مسح الموعد</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setViewMode('days');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#0c3e35]/60 hover:bg-[#0c3e35] border border-transparent hover:border-[#d4af37]/30 text-gray-300 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ),
          document.body
        )}
    </div>
  );
};
