'use client';

import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { Attachment } from '../types';
import {
  FileText,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Paperclip,
  Plus,
  Eye,
  Trash2,
} from 'lucide-react';

export interface PdfAttachmentPickerProps {
  // Support both multiple attachments (array) and single attachment (backward compatibility)
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;

  attachment?: Attachment | null;
  onAttachmentChange?: (attachment: Attachment | null) => void;

  category?: string;
  label?: string;
  hint?: string;
  compact?: boolean;
  maxFiles?: number;
}

export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 بايت';
  const k = 1024;
  const sizes = ['بايت', 'كيلوبايت', 'ميغابايت', 'غيغابايت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const PdfAttachmentPicker: React.FC<PdfAttachmentPickerProps> = ({
  attachments,
  onAttachmentsChange,
  attachment,
  onAttachmentChange,
  category = 'GENERAL',
  label = 'المستندات والتقارير الرسمية المرفقة (PDF)',
  hint = 'يمكنك إرفاق عدة مستندات رسمية (حتى 25 ميغابايت لكل ملف بصيغة PDF)',
  compact = false,
  maxFiles = 10,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Normalize current attachments list
  const currentList: Attachment[] = attachments
    ? attachments
    : attachment
    ? [attachment]
    : [];

  const updateList = (newList: Attachment[]) => {
    if (onAttachmentsChange) {
      onAttachmentsChange(newList);
    }
    if (onAttachmentChange) {
      onAttachmentChange(newList[0] || null);
    }
  };

  const handleFiles = async (filesList: FileList | File[]) => {
    setError(null);
    const files = Array.from(filesList);
    if (files.length === 0) return;

    if (currentList.length + files.length > maxFiles) {
      setError(`الحد الأقصى المسموح به هو ${maxFiles} مستندات رسمية`);
      return;
    }

    // Validate all files
    for (const f of files) {
      const isPdf =
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setError(`الملف (${f.name}) ليس بصيغة PDF. يُسمح فقط بمستندات PDF الرسمية.`);
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError(`الملف (${f.name}) يتجاوز الحد الأقصى المسموح به (25 ميغابايت).`);
        return;
      }
    }

    try {
      setUploading(true);
      const newlyUploaded: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadStatus(`جارٍ رفع المستند (${i + 1} من ${files.length})...`);
        const res = await api.uploadAttachment(f, category);
        newlyUploaded.push(res);
      }

      updateList([...currentList, ...newlyUploaded]);
    } catch (err: any) {
      console.error('Failed to upload PDF attachment:', err);
      setError(err?.message || 'حدث خطأ أثناء رفع أحد الملفات، يرجى المحاولة ثانية.');
    } finally {
      setUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveOne = async (attId: string) => {
    try {
      await api.deleteAttachment(attId);
    } catch (err) {
      console.warn('Could not delete attachment from server', err);
    }
    updateList(currentList.filter((a) => a.id !== attId));
  };

  const hasFiles = currentList.length > 0;
  const canAddMore = currentList.length < maxFiles;

  return (
    <div className="space-y-2 font-sans text-right">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-[#d4af37]" />
          <span>{label}</span>
        </label>
        {hasFiles && (
          <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>
              {currentList.length === 1
                ? 'مستند رسمي واحد'
                : `${currentList.length} مستندات رسمية`}
            </span>
          </span>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* List of Attached PDF Documents */}
      {hasFiles && (
        <div className="space-y-2">
          {currentList.map((att, idx) => (
            <div
              key={att.id}
              className="p-2.5 sm:p-3 rounded-xl bg-white border border-[#d2d1c9] hover:border-[#0c3e35] transition shadow-2xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-extrabold text-[#0c3e35] truncate"
                    title={att.fileName}
                  >
                    {att.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-[#5e736e] mt-0.5">
                    <span className="font-semibold text-[#8daaa2]">
                      {formatFileSize(att.fileSize)}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-700 font-bold">
                      مستند PDF رسمي #{idx + 1}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={api.getAttachmentUrl(att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-bold text-[#0c3e35] bg-[#edece4] hover:bg-[#d2d1c9] transition cursor-pointer"
                  title="معاينة المستند في تبويب جديد"
                >
                  <Eye className="w-3 h-3 text-[#d4af37]" />
                  <span>معاينة</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveOne(att.id)}
                  className="p-1 rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer"
                  title="إزالة هذا المستند"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploading Status Overlay / Indicator */}
      {uploading && (
        <div className="p-3 rounded-xl bg-[#0c3e35]/5 border border-[#0c3e35]/20 flex items-center justify-center gap-2.5 text-xs font-bold text-[#0c3e35] animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
          <span>{uploadStatus || 'جارٍ رفع ومعالجة المستندات...'}</span>
        </div>
      )}

      {/* Upload Box / "Add More" Trigger */}
      {!uploading && canAddMore && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl transition cursor-pointer text-center select-none active:scale-[0.99] touch-manipulation ${
            isDragOver
              ? 'border-[#0c3e35] bg-[#0c3e35]/5 shadow-sm'
              : 'border-[#d2d1c9] bg-white hover:border-[#0c3e35]/60 hover:bg-[#fcfbf7]'
          } ${
            hasFiles
              ? 'p-2.5 sm:p-3 flex items-center justify-center gap-2'
              : compact
              ? 'p-3'
              : 'p-3.5 sm:p-5'
          }`}
        >
          {hasFiles ? (
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#0c3e35] hover:text-[#072923]">
              <Plus className="w-4 h-4 text-[#d4af37]" />
              <span>إضافة مستند رسمي آخر (PDF)...</span>
              <span className="text-[10.5px] text-[#8daaa2] font-medium mr-1">
                (متبقي {maxFiles - currentList.length} متاح)
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3.5 py-1">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#0c3e35]/5 text-[#0c3e35] flex items-center justify-center shrink-0 border border-[#0c3e35]/15 shadow-2xs">
                <UploadCloud className="w-5 h-5 text-[#0c3e35]" />
              </div>
              <div className="text-center sm:text-right space-y-1">
                <p className="text-xs font-extrabold text-[#0c3e35] leading-snug">
                  <span className="sm:hidden">اضغط لاختيار مستندات PDF</span>
                  <span className="hidden sm:inline">انقر لاختيار مستندات PDF أو اسحبها إلى هنا</span>
                  <span className="text-[11px] font-medium text-[#5e736e] block sm:inline sm:mr-1.5">
                    (يمكنك تحديد عدة ملفات)
                  </span>
                </p>
                {hint && (
                  <p className="text-[10px] sm:text-[10.5px] text-[#8daaa2] font-medium leading-relaxed">
                    {hint}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Validation or Upload Error */}
      {error && (
        <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold flex items-center gap-1.5 animate-fadeIn">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
