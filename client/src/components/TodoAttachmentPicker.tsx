'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, X, FileText } from 'lucide-react';
import { Attachment } from '../types';
import { MAX_TODO_ATTACHMENTS, TODO_FILE_ACCEPT, todoFileError } from '../lib/todoAttachments';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export const attachmentFileSize = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.ceil(size / 1024)} KB`;

export function TodoAttachmentPicker({ files, onFilesChange, attachments = [], onAttachmentsChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const count = attachments.length + files.length;
  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');
    if (count + selected.length > MAX_TODO_ATTACHMENTS) {
      setError('يُسمح بإرفاق عشرة ملفات كحد أقصى لكل مهمة');
      return;
    }
    for (const file of selected) {
      const message = todoFileError(file);
      if (message) { setError(message); return; }
    }
    onFilesChange([...files, ...selected]);
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple accept={TODO_FILE_ACCEPT} onChange={selectFiles} disabled={disabled} className="hidden" aria-label="اختيار ملفات لإرفاقها بالمهمة" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || count >= MAX_TODO_ATTACHMENTS}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] bg-[#f8f9fa] hover:bg-[#0c3e35]/10 transition disabled:opacity-50">
        <Paperclip className="w-4 h-4" /> إرفاق ملفات {count > 0 && <span>({count})</span>}
      </button>
      <p className="text-[11px] text-[#5e736e]">PDF، صور، Word، Excel، PowerPoint، TXT، CSV، ZIP — حتى 25 ميغابايت للملف و10 ملفات للمهمة. تُحفظ المرفقات عند حفظ المهمة.</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {count > 0 && <ul className="space-y-1.5">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex items-center gap-2 p-2 rounded-xl border border-[#d2d1c9]/60 text-xs text-[#0c3e35]">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={attachment.fileName}>{attachment.fileName}</span>
            <span dir="ltr" className="text-[10px] text-[#5e736e] shrink-0">{attachmentFileSize(attachment.fileSize)}</span>
            <button type="button" disabled={disabled} onClick={() => onAttachmentsChange?.(attachments.filter((item) => item.id !== attachment.id))}
              aria-label={`إزالة ${attachment.fileName}`} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"><X className="w-4 h-4" /></button>
          </li>
        ))}
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center gap-2 p-2 rounded-xl border border-[#d2d1c9]/60 text-xs text-[#0c3e35]">
            <Paperclip className="w-4 h-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
            <span dir="ltr" className="text-[10px] text-[#5e736e] shrink-0">{attachmentFileSize(file.size)}</span>
            <button type="button" disabled={disabled} onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
              aria-label={`إزالة ${file.name}`} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"><X className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
