'use client';

import React from 'react';
import { Attachment } from '../types';
import { api } from '../services/api';
import { formatFileSize } from './PdfAttachmentPicker';
import { FileText, Eye, Download, ExternalLink, ShieldCheck } from 'lucide-react';

interface PdfAttachmentCardProps {
  attachment: Attachment;
  title?: string;
  badgeText?: string;
  variant?: 'default' | 'compact' | 'paper';
}

export const PdfAttachmentCard: React.FC<PdfAttachmentCardProps> = ({
  attachment,
  title,
  badgeText = 'مستند رسمي PDF',
  variant = 'default',
}) => {
  const previewUrl = api.getAttachmentUrl(attachment.id, false);
  const downloadUrl = api.getAttachmentUrl(attachment.id, true);

  if (variant === 'compact') {
    return (
      <div className="p-2.5 rounded-xl bg-white border border-[#d2d1c9] hover:border-[#0c3e35] transition shadow-2xs flex items-center justify-between gap-2.5 font-sans text-right">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0 shadow-2xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#0c3e35] truncate" title={attachment.fileName}>
              {attachment.fileName}
            </p>
            <span className="text-[10px] text-[#8daaa2]">
              {formatFileSize(attachment.fileSize)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-bold text-[#0c3e35] bg-[#edece4] hover:bg-[#d2d1c9] transition cursor-pointer"
            title="معاينة المستند في تبويب جديد"
          >
            <Eye className="w-3 h-3 text-[#d4af37]" />
            <span>معاينة</span>
          </a>
          <a
            href={downloadUrl}
            className="p-1 rounded-lg text-[#0c3e35] hover:bg-[#edece4] transition cursor-pointer"
            title="تحميل الملف"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-2xl transition shadow-xs font-sans text-right ${
      variant === 'paper'
        ? 'bg-[#fcfbf7] border-2 border-[#0c3e35]/20 hover:border-[#0c3e35]/40'
        : 'bg-white border border-[#d2d1c9] hover:border-[#0c3e35]'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0 shadow-xs">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            {title && (
              <p className="text-[11px] font-bold text-[#5e736e] mb-0.5">
                {title}
              </p>
            )}
            <p className="text-xs sm:text-sm font-black text-[#0c3e35] truncate" title={attachment.fileName}>
              {attachment.fileName}
            </p>
            <div className="flex items-center gap-2 text-[10.5px] text-[#8daaa2] mt-0.5 font-medium">
              <span className="font-bold text-[#0c3e35] bg-[#edece4] px-1.5 py-0.2 rounded">
                {formatFileSize(attachment.fileSize)}
              </span>
              <span>•</span>
              <span className="text-emerald-800 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                {badgeText}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95"
          >
            <Eye className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>معاينة المستند</span>
          </a>
          <a
            href={downloadUrl}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#edece4] hover:bg-[#d2d1c9] text-[#0c3e35] text-xs font-bold transition cursor-pointer active:scale-95"
            title="تحميل الملف بالاسم الأصلي"
          >
            <Download className="w-3.5 h-3.5 text-[#0c3e35]" />
            <span>تحميل</span>
          </a>
        </div>
      </div>
    </div>
  );
};
