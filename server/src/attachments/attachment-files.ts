import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Prisma } from '@prisma/client';

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
export const MAX_TODO_ATTACHMENTS = 10;

// Official workflows must not repurpose private agenda uploads or their files.
export function officialAttachmentWhere(ids: string[]): Prisma.AttachmentWhereInput {
  return { id: { in: ids }, todoId: null, OR: [{ category: null }, { category: { not: 'TODO' } }] };
}

const todoMimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
};

export function attachmentMimeType(file: { originalname: string; mimetype: string }, category?: string): string {
  if (category === 'TODO') {
    const mimeType = todoMimeTypes[path.extname(file.originalname).toLowerCase()];
    if (!mimeType) throw new BadRequestException('صيغة الملف غير مدعومة. يُسمح بملفات PDF والصور وWord وExcel وPowerPoint والنصوص وZIP');
    return mimeType;
  }
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf';
  }
  throw new BadRequestException('يُسمح فقط برفع مستندات رسمية بصيغة PDF');
}

export async function removeAttachmentFiles(attachments: { fileUrl: string }[]): Promise<void> {
  const uploadDir = path.resolve(process.cwd(), 'uploads', 'attachments') + path.sep;
  await Promise.all(attachments.map(async ({ fileUrl }) => {
    const filePath = path.resolve(process.cwd(), fileUrl);
    if (!filePath.startsWith(uploadDir)) return;
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Could not remove attachment file', error);
      }
    }
  }));
}
