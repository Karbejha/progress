import { Attachment } from '../types';

export const MAX_TODO_ATTACHMENTS = 10;
export const MAX_TODO_FILE_SIZE = 25 * 1024 * 1024;
export const TODO_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

export function todoFileError(file: Pick<File, 'name' | 'size'>): string | null {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!TODO_FILE_ACCEPT.split(',').includes(extension)) return `صيغة الملف «${file.name}» غير مدعومة`;
  if (file.size > MAX_TODO_FILE_SIZE) return `حجم الملف «${file.name}» يتجاوز 25 ميغابايت`;
  if (file.size === 0) return `الملف «${file.name}» فارغ`;
  return null;
}

interface UploadApi {
  uploadAttachment: (file: File, category: string) => Promise<Attachment>;
  deleteAttachment: (id: string, onlyUnlinked?: boolean) => Promise<unknown>;
}

// Files stay local until Save. Failed saves clean up only unlinked uploads, so a
// lost response cannot delete attachments already committed by the server.
export async function saveTodoAttachments<T>(
  api: UploadApi,
  files: File[],
  existing: Attachment[],
  save: (ids: string[]) => Promise<T>,
): Promise<T> {
  if (files.length + existing.length > MAX_TODO_ATTACHMENTS) throw new Error('يُسمح بإرفاق عشرة ملفات كحد أقصى');
  for (const file of files) {
    const error = todoFileError(file);
    if (error) throw new Error(error);
  }
  const uploaded: Attachment[] = [];
  try {
    for (const file of files) uploaded.push(await api.uploadAttachment(file, 'TODO'));
    return await save([...existing, ...uploaded].map((attachment) => attachment.id));
  } catch (error) {
    await Promise.allSettled(uploaded.map((attachment) => api.deleteAttachment(attachment.id, true)));
    throw error;
  }
}
