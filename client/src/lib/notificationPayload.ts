/** FCM data values are strings; socket and local notifications carry objects. */
export function normalizeNotificationPayload(
  data: Record<string, any> | undefined | null,
  fallback: { id?: string | number; title?: string; body?: string } = {},
): Record<string, any> | null {
  if (!data || typeof data !== 'object') return null;
  let metadata = data.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) metadata = {};
  const type = String(data.type || '').toLowerCase().replace(/_/g, '-');
  const id = data.notificationId || data.id || fallback.id;
  if (!id) return null;
  const title = data.title || fallback.title || data['gcm.notification.title'] || '';
  const message = data.message || data.body || fallback.body || data['gcm.notification.body'] || '';
  return {
    ...metadata,
    ...data,
    metadata,
    id: String(id),
    notificationId: String(id),
    type,
    title,
    message,
    body: message,
    content: data.content || metadata.content || message,
    isShared: data.isShared === 'true' || data.isShared === true || metadata.isShared === true,
  };
}

/** Android local notification IDs must be nonzero, positive signed 32-bit integers. */
export function toNotificationIntegerId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 2147483647) || 1;
}

export function isNotificationForUser(
  data: { userId?: string },
  authenticatedUserId: string | null | undefined,
): boolean {
  return Boolean(authenticatedUserId) && (!data.userId || data.userId === authenticatedUserId);
}
