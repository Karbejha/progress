export interface PersistedNotification {
  id: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface InboxNotification {
  id: string;
  title: string;
  message: string;
  content?: string;
  authorName?: string;
  authorTitle?: string;
  priority?: string;
  createdAt: string;
  type: 'plan' | 'task' | 'summary' | 'feedback' | 'announcement';
  time: string;
  fullPayload: Record<string, any>;
}

export function toInboxNotification(record: PersistedNotification): InboxNotification {
  const metadata = record.metadata || {};
  const type = record.type === 'executive-task' || record.type === 'executive-task-update'
    ? 'task'
    : (['plan', 'task', 'summary', 'feedback', 'announcement'].includes(record.type)
      ? record.type as InboxNotification['type']
      : 'feedback');
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    content: metadata.content || metadata.description || metadata.feedbackText,
    authorName: metadata.authorName || metadata.fromUserName || metadata.assignedByName || metadata.directorName,
    authorTitle: metadata.authorTitle || metadata.fromUserTitle,
    priority: metadata.priority || metadata.task?.priority,
    createdAt: record.createdAt,
    type,
    time: new Date(record.createdAt).toLocaleString('ar-SY', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
    fullPayload: { ...metadata, referenceId: record.referenceId, dbId: record.id, notificationType: record.type },
  };
}

// Only immutable announcements share a read key with their referenced entity.
// Task and plan updates are separate notifications even when they refer to the same entity.
export function isInboxNotificationRead(item: InboxNotification, keys: readonly string[]): boolean {
  return keys.includes(item.id) || (item.type === 'announcement'
    && !!item.fullPayload.referenceId && keys.includes(item.fullPayload.referenceId));
}

export function mergeInboxNotifications(
  existing: InboxNotification[], incoming: InboxNotification[], limit = 150,
): InboxNotification[] {
  const records = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => records.set(item.id, item));
  return [...records.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}
