'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, Calendar, User, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface AnnouncementModalData {
  id?: string;
  title: string;
  content: string;
  authorName?: string;
  authorTitle?: string;
  priority?: string;
  createdAt?: string;
}

interface AnnouncementDetailsModalProps {
  data: AnnouncementModalData | null;
  onClose: () => void;
}

export const AnnouncementDetailsModal: React.FC<AnnouncementDetailsModalProps> = ({
  data,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!data) return;

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
  }, [data, onClose]);

  if (!mounted || !data) return null;

  const formattedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('ar-SY', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleDateString('ar-SY', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  const getPriorityBadge = (p?: string) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            تعميم عاجل جداً
          </span>
        );
      case 'HIGH':
        return (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            أولوية مرتفعة
          </span>
        );
      default:
        return (
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
            تعميم إداري رسمي
          </span>
        );
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-6 bg-[#05261e] text-white flex items-center justify-between border-b border-[#0c3e35]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-2 shadow-md">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار المديرية العامة للموانئ"
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                  الجمهورية العربية السورية • المديرية العامة للموانئ
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-1">
                تفاصيل التعميم والتوجيه الإداري
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Metadata Block */}
          <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[#0c3e35] font-bold">
                <User className="w-4 h-4 text-[#d4af37]" />
                <span>الجهة المصدرة: <strong>{data.authorName || 'المدير العام للموانئ'}</strong> {data.authorTitle ? `(${data.authorTitle})` : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-[#5e736e]">
                <Calendar className="w-4 h-4 text-[#8daaa2]" />
                <span>تاريخ وتوقيت الصدور: {formattedDate}</span>
              </div>
            </div>

            <div>{getPriorityBadge(data.priority)}</div>
          </div>

          {/* Announcement Official Paper Document */}
          <div className="p-6 sm:p-8 rounded-[24px] bg-white border-2 border-[#0c3e35]/30 space-y-4 shadow-sm relative">
            
            {/* Corner Decorative Watermark */}
            <div className="absolute top-4 left-4 opacity-10 pointer-events-none">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار"
                width={80}
                height={80}
              />
            </div>

            <div className="border-b border-[#e5e4dc] pb-3">
              <h3 className="text-base sm:text-lg font-black text-[#0c3e35] leading-snug">
                {data.title}
              </h3>
            </div>

            {/* Circular Full Content Text */}
            <div className="text-xs sm:text-sm text-[#0c3e35] leading-relaxed whitespace-pre-line font-medium text-justify">
              {data.content}
            </div>

            <div className="pt-6 border-t border-[#e5e4dc] flex items-center justify-between text-xs text-[#5e736e]">
              <span className="font-bold text-[#0c3e35]">المديرية العامة للموانئ - مكتب المدير العام</span>
              <span className="text-[11px] text-[#8daaa2]">نسخة معتمدة وموزعة إلكترونياً</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2d1c9] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#5e736e] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>متاح دائماً للمراجعة عبر أيقونة الإشعارات بالأعلى</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold transition shadow-md cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
