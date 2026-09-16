'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Loader2, X, FileText } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  itemName?: string;
  itemBadge?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأكيد الحذف',
  description = 'هل أنت متأكد من رغبتك في حذف هذا العنصر؟',
  itemName,
  itemBadge,
  confirmText = 'تأكيد الحذف',
  cancelText = 'إلغاء',
  isLoading = false,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-xs animate-fadeIn font-sans"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-[380px] sm:max-w-md bg-white border border-[#d2d1c9] rounded-[24px] sm:rounded-[28px] shadow-2xl overflow-hidden text-right font-sans p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Red Icon + Close Button */}
        <div className="flex items-center justify-between gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-xs shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-[#0c3e35] hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Text Content */}
        <div className="space-y-1.5 text-right">
          <h3 className="text-base sm:text-lg font-black text-[#05261e] leading-snug">
            {title}
          </h3>

          <p className="text-xs sm:text-[13px] text-[#5e736e] leading-relaxed font-medium">
            {description}
          </p>

          {/* Item Preview Card */}
          {itemName && (
            <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-[#f8f7f2] border border-[#e4e2d8] space-y-1.5 text-right">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#8daaa2] shrink-0" />
                <span className="text-xs sm:text-[13px] font-bold text-[#0c3e35] break-words line-clamp-2">
                  {itemName}
                </span>
              </div>
              {itemBadge && (
                <div>
                  <span className="inline-block text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                    {itemBadge}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons: 2 Equal-Width Columns for Mobile and Desktop Touch */}
        <div className="pt-3 border-t border-[#f0efe9] grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-full min-h-[44px] px-3 py-2.5 text-xs sm:text-sm font-bold rounded-xl border border-[#d2d1c9] text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer flex items-center justify-center shadow-xs disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full min-h-[44px] px-3 py-2.5 text-xs sm:text-sm font-extrabold rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 shrink-0" />
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
