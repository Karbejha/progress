// These tags carry links between a personal agenda item and its plan/assignment
// copies. Keep every original tag when editing the visible description.
const SYSTEM_TODO_TAG = /\[(?:تم تحويلها إلى الخطة اليومية الصباحية|تم إدراجها في الخطة اليومية(?: بتاريخ:[^\]]+)?|تم تحويلها إلى تكليف تنفيذي رسمي|تم إسنادها كتكليف تنفيذي|معرف (?:المهمة|التكليف|المفكرة):\s*[^\]]+)\]/g;

export function preserveTodoSystemTags(
  description: string,
  originalDescription?: string | null,
): string {
  const tags = originalDescription?.match(SYSTEM_TODO_TAG) || [];
  return [description.trim(), ...tags].filter(Boolean).join('\n');
}
