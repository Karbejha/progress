export const OFFICIAL_FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp';
export const OFFICIAL_FILE_HINT = 'الصيغ المدعومة: PDF، Word، Excel، صور JPG وPNG وWebP — حتى 25 ميغابايت لكل ملف';

export function officialFileError(file: Pick<File, 'name' | 'size'>): string | null {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!OFFICIAL_FILE_ACCEPT.split(',').includes(extension)) {
    return `صيغة الملف «${file.name}» غير مدعومة. يُسمح بملفات PDF وWord وExcel وصور JPG وPNG وWebP`;
  }
  if (file.size === 0) return `الملف «${file.name}» فارغ`;
  if (file.size > 25 * 1024 * 1024) return `حجم الملف «${file.name}» يتجاوز 25 ميغابايت`;
  return null;
}

export function canPreviewAttachment(mimeType: string): boolean {
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
}

export function attachmentTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'صورة';
  if (['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) return 'Word';
  if (['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mimeType)) return 'Excel';
  return 'ملف';
}
