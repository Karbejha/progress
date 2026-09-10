'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';

export interface CustomMonthPickerProps {
  value: string; // YYYY-MM e.g. "2026-09"
  onChange: (monthStr: string) => void;
  className?: string;
  disabled?: boolean;
}

const ARABIC_MONTHS = [
  { index: 0, name: 'كانون الثاني (1)', short: 'كانون 2' },
  { index: 1, name: 'شباط (2)', short: 'شباط' },
  { index: 2, name: 'آذار (3)', short: 'آذار' },
  { index: 3, name: 'نيسان (4)', short: 'نيسان' },
  { index: 4, name: 'أيار (5)', short: 'أيار' },
  { index: 5, name: 'حزيران (6)', short: 'حزيران' },
  { index: 6, name: 'تموز (7)', short: 'تموز' },
  { index: 7, name: 'آب (8)', short: 'آب' },
  { index: 8, name: 'أيلول (9)', short: 'أيلول' },
  { index: 9, name: 'تشرين الأول (10)', short: 'تشرين 1' },
  { index: 10, name: 'تشرين الثاني (11)', short: 'تشرين 2' },
  { index: 11, name: 'كانون الأول (12)', short: 'كانون 1' },
];

const padZero = (n: number) => n.toString().padStart(2, '0');

export const CustomMonthPicker: React.FC<CustomMonthPickerProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Parse YYYY-MM
  const { currentYear, currentMonthIndex } = React.useMemo(() => {
    if (value && /^\d{4}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      return { currentYear: y, currentMonthIndex: m - 1 };
    }
    const now = new Date();
    return { currentYear: now.getFullYear(), currentMonthIndex: now.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(currentYear);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync view year when value changes from outside
  useEffect(() => {
    if (value && /^\d{4}-\d{2}$/.test(value)) {
      const [y] = value.split('-').map(Number);
      if (y && !isNaN(y)) {
        setViewYear(y);
      }
    }
  }, [value]);

  // Positioning relative to trigger for desktop
  const updatePosition = () => {
    if (!triggerRef.current || isMobile) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(320, window.innerWidth - 32);
    const popoverHeight = 310;
    const padding = 12;

    let left = rect.right - popoverWidth;
    if (left < padding) left = padding;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }

    let top = rect.bottom + 8;
    // Check if overflowing viewport bottom
    if (top + popoverHeight > window.innerHeight - padding) {
      const altTop = rect.top - popoverHeight - 8;
      if (altTop >= padding) {
        top = altTop;
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
  }, [isOpen, viewYear, isMobile]);

  // Click outside and Esc handlers
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
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
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

  const handleSelectMonth = (monthIndex: number) => {
    const formatted = `${viewYear}-${padZero(monthIndex + 1)}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleSelectCurrentMonth = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    const formatted = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleSelectPrevMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    setViewYear(d.getFullYear());
    const formatted = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}`;
    onChange(formatted);
    setIsOpen(false);
  };

  // Formatted display in Arabic for trigger button
  const displayLabel = React.useMemo(() => {
    const monthObj = ARABIC_MONTHS[currentMonthIndex];
    const monthName = monthObj ? monthObj.short : '';
    return `${monthName} ${currentYear}`;
  }, [currentMonthIndex, currentYear]);

  return (
    <div className="relative inline-block">
      {/* Trigger Button */}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 bg-[#0c3e35] hover:bg-[#0e483e]
          border ${isOpen ? 'border-[#d4af37] ring-2 ring-[#d4af37]/30 shadow-md' : 'border-[#d4af37]/40 hover:border-[#d4af37]/80'}
          px-3 py-1.5 rounded-xl text-xs text-white cursor-pointer select-none
          transition-all duration-200 shadow-xs group active:scale-[0.98]
          ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
          ${className}
        `}
        title="انقر لاختيار الشهر والسنة"
      >
        <div className="p-1 rounded-lg bg-[#05261e] border border-[#d4af37]/30 text-[#d4af37] group-hover:border-[#d4af37]/60 group-hover:scale-105 transition-all shrink-0">
          <CalendarIcon className="w-3.5 h-3.5" />
        </div>

        <span className="font-bold text-[#d4af37] text-xs">
          {displayLabel}
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-[#d4af37] transition-transform duration-300 shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Popover / Modal via Portal */}
      {mounted &&
        isOpen &&
        createPortal(
          isMobile ? (
            /* Mobile Sheet Backdrop */
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                ref={popoverRef}
                style={{ backgroundColor: '#05261e' }}
                className="w-full max-w-[320px] border-2 border-[#d4af37]/70 rounded-3xl shadow-2xl text-white p-4 select-none overflow-hidden animate-in zoom-in-95 duration-150"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Year Navigation Header */}
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#0c3e35]">
                  <button
                    type="button"
                    onClick={() => setViewYear((prev) => prev - 1)}
                    className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 transition active:scale-95 cursor-pointer"
                    title="السنة السابقة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <span className="text-sm font-extrabold text-white text-center">
                    السنة: <strong className="text-[#d4af37] font-black text-base mr-1">{viewYear}</strong>
                  </span>

                  <button
                    type="button"
                    onClick={() => setViewYear((prev) => prev + 1)}
                    className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 transition active:scale-95 cursor-pointer"
                    title="السنة القادمة"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                {/* 12 Months Grid */}
                <div className="grid grid-cols-3 gap-2 py-1">
                  {ARABIC_MONTHS.map((m) => {
                    const isSelected = viewYear === currentYear && m.index === currentMonthIndex;
                    return (
                      <button
                        key={m.index}
                        type="button"
                        onClick={() => handleSelectMonth(m.index)}
                        className={`
                          p-2.5 rounded-xl text-xs font-bold transition text-center cursor-pointer
                          ${
                            isSelected
                              ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                              : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                          }
                        `}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Shortcuts Footer */}
                <div className="mt-3 pt-3 border-t border-[#0c3e35] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectCurrentMonth}
                      className="px-2.5 py-1.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-[11px] font-black transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>الحالي</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectPrevMonth}
                      className="px-2.5 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 text-[#d4af37] text-[11px] font-bold transition active:scale-95 cursor-pointer"
                    >
                      <span>السابق</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-3 py-1.5 rounded-xl bg-[#0c3e35]/60 hover:bg-[#0c3e35] text-gray-300 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Popover */
            <div
              ref={popoverRef}
              style={{ ...popoverStyle, backgroundColor: '#05261e' }}
              className="border-2 border-[#d4af37]/70 rounded-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.95),0_0_25px_rgba(212,175,55,0.25)] text-white p-3.5 select-none animate-in fade-in zoom-in-95 duration-150"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Year Navigation Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#0c3e35]">
                <button
                  type="button"
                  onClick={() => setViewYear((prev) => prev - 1)}
                  className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 transition active:scale-95 cursor-pointer"
                  title="السنة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="text-xs font-bold text-white text-center">
                  السنة: <strong className="text-[#d4af37] font-black text-sm mr-1">{viewYear}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setViewYear((prev) => prev + 1)}
                  className="p-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#165b4f] text-[#d4af37] border border-[#d4af37]/30 transition active:scale-95 cursor-pointer"
                  title="السنة القادمة"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* 12 Months Grid */}
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {ARABIC_MONTHS.map((m) => {
                  const isSelected = viewYear === currentYear && m.index === currentMonthIndex;
                  return (
                    <button
                      key={m.index}
                      type="button"
                      onClick={() => handleSelectMonth(m.index)}
                      className={`
                        p-2 rounded-xl text-xs font-bold transition text-center cursor-pointer
                        ${
                          isSelected
                            ? 'bg-[#d4af37] text-[#05261e] font-black shadow-md'
                            : 'bg-[#0c3e35] hover:bg-[#165b4f] text-white hover:text-[#d4af37] border border-[#d4af37]/20'
                        }
                      `}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>

              {/* Quick Shortcuts Footer */}
              <div className="mt-2.5 pt-2.5 border-t border-[#0c3e35] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectCurrentMonth}
                    className="px-2 py-1 rounded-lg bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-[10.5px] font-black transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>الشهر الحالي</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectPrevMonth}
                    className="px-2 py-1 rounded-lg bg-[#0c3e35] hover:bg-[#165b4f] border border-[#d4af37]/40 text-[#d4af37] text-[10.5px] font-bold transition active:scale-95 cursor-pointer"
                  >
                    <span>السابق</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-2.5 py-1 rounded-lg bg-[#0c3e35]/60 hover:bg-[#0c3e35] text-gray-300 hover:text-white text-[10.5px] font-semibold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ),
          document.body,
        )}
    </div>
  );
};
