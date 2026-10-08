'use client';

import { Download, ExternalLink, FileText } from 'lucide-react';
import { Attachment } from '../types';
import { api } from '../services/api';
import { attachmentFileSize } from './TodoAttachmentPicker';

export function TodoAttachmentCard({ attachment }: { attachment: Attachment }) {
  const canPreview = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimeType);
  return (
    <div className="flex items-center gap-2 min-w-0 rounded-xl border border-[#d2d1c9]/70 bg-[#f8f9fa] px-2.5 py-2 text-[#0c3e35]" onClick={(event) => event.stopPropagation()}>
      <FileText className="w-4 h-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate" title={attachment.fileName}>{attachment.fileName}</p>
        <p dir="ltr" className="text-[10px] text-[#5e736e] text-right">{attachmentFileSize(attachment.fileSize)}</p>
      </div>
      {canPreview && <a href={api.getAttachmentUrl(attachment.id)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`عرض ${attachment.fileName}`} title="عرض الملف" className="p-2 rounded-lg hover:bg-[#0c3e35]/10"><ExternalLink className="w-4 h-4" /></a>}
      <a href={api.getAttachmentUrl(attachment.id, true)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`تنزيل ${attachment.fileName}`} title="تنزيل الملف" className="p-2 rounded-lg hover:bg-[#0c3e35]/10"><Download className="w-4 h-4" /></a>
    </div>
  );
}
