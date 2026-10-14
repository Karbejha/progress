'use client';

import { api } from '../services/api';

const pendingReadRequests = new Map<string, Promise<void>>();
const pendingReadsKey = (userId: string) => `ports_pending_notification_reads_${userId}`;
const getPendingReads = (userId: string): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(pendingReadsKey(userId)) || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && !!id) : [];
  } catch { return []; }
};

/** Retry offline read acknowledgements only for the account that created them. */
export function flushPendingNotificationReads(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !userId || api.getCurrentUser()?.id !== userId || !api.getToken()) {
    return Promise.resolve();
  }
  const existing = pendingReadRequests.get(userId);
  if (existing) return existing;
  const request = (async () => {
    try {
      while (api.getCurrentUser()?.id === userId && api.getToken()) {
        const batch = getPendingReads(userId).slice(0, 500);
        if (!batch.length) break;
        await api.markNotificationsRead(batch);
        const remaining = getPendingReads(userId).filter((id) => !batch.includes(id));
        localStorage.setItem(pendingReadsKey(userId), JSON.stringify(remaining));
      }
    } catch {
      // The durable queue is retried on reconnect, focus and the inbox refresh.
    }
  })().finally(() => { pendingReadRequests.delete(userId); });
  pendingReadRequests.set(userId, request);
  return request;
}

const persistReadKeys = (userId: string, keys: string[]) => {
  const pending = Array.from(new Set([...getPendingReads(userId), ...keys]));
  localStorage.setItem(pendingReadsKey(userId), JSON.stringify(pending));
  void flushPendingNotificationReads(userId);
};

export const getReadAnnouncementIds = (userId: string): string[] => {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = localStorage.getItem(`ports_read_announcements_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const isAnnouncementRead = (userId: string, announcementId: string): boolean => {
  if (!userId || !announcementId) return false;
  const readIds = getReadAnnouncementIds(userId);
  return readIds.includes(announcementId);
};

export const markAnnouncementAsRead = (userId: string, announcementId: string): void => {
  if (typeof window === 'undefined' || !userId || !announcementId) return;
  try {
    const current = getReadAnnouncementIds(userId);
    if (!current.includes(announcementId)) {
      const updated = [...current, announcementId];
      localStorage.setItem(`ports_read_announcements_${userId}`, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent('announcements:read_updated', {
          detail: { userId, announcementId, readIds: updated },
        })
      );
    }
    // Persist to server
    api.markAnnouncementRead(announcementId).catch(() => {});
    persistReadKeys(userId, [announcementId]);
  } catch (e) {
    console.error('Failed to mark announcement as read', e);
  }
};

export const markAllAnnouncementsAsRead = (userId: string, announcementIds: string[]): void => {
  if (typeof window === 'undefined' || !userId || !announcementIds.length) return;
  try {
    const current = getReadAnnouncementIds(userId);
    const set = new Set([...current, ...announcementIds]);
    const updated = Array.from(set);
    localStorage.setItem(`ports_read_announcements_${userId}`, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent('announcements:read_updated', {
        detail: { userId, readIds: updated },
      })
    );
    // Persist to server
    persistReadKeys(userId, announcementIds);
    announcementIds.forEach((id) => {
      api.markAnnouncementRead(id).catch(() => {});
    });
  } catch (e) {
    console.error('Failed to mark all announcements as read', e);
  }
};

// Generic Notification Read Helpers (for Tasks, Plans, Summaries, Feedback, Announcements)
export const getReadNotificationIds = (userId: string): string[] => {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = localStorage.getItem(`ports_read_notifications_${userId}`);
    const annReads = getReadAnnouncementIds(userId);
    const notifReads: string[] = raw ? JSON.parse(raw) : [];
    return Array.from(new Set([...notifReads, ...annReads]));
  } catch {
    return [];
  }
};

/**
 * Hydrates local storage with server-side read keys and returns the combined set.
 * This guarantees that even after clearing cookies / local storage, server state is restored.
 */
export const syncReadNotificationsFromServer = (userId: string, serverKeys: string[]): string[] => {
  if (!userId) return [];
  try {
    const current = getReadNotificationIds(userId);
    const merged = Array.from(new Set([...current, ...serverKeys]));
    if (typeof window !== 'undefined') {
      localStorage.setItem(`ports_read_notifications_${userId}`, JSON.stringify(merged));

      // Also sync announcement IDs to ports_read_announcements_
      const annKeys = serverKeys.filter(
        (k) =>
          !k.startsWith('exec-task-') &&
          !k.startsWith('plan-sub-') &&
          !k.startsWith('summary-sub-') &&
          !k.startsWith('feedback-') &&
          !k.startsWith('task-up-')
      );
      if (annKeys.length > 0) {
        const currentAnns = getReadAnnouncementIds(userId);
        const mergedAnns = Array.from(new Set([...currentAnns, ...annKeys]));
        localStorage.setItem(`ports_read_announcements_${userId}`, JSON.stringify(mergedAnns));
      }
    }
    return merged;
  } catch {
    return serverKeys;
  }
};

export const markNotificationAsRead = (userId: string, notifId: string): void => {
  if (typeof window === 'undefined' || !userId || !notifId) return;
  try {
    const current = getReadNotificationIds(userId);
    if (!current.includes(notifId)) {
      const updated = [...current, notifId];
      localStorage.setItem(`ports_read_notifications_${userId}`, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent('notifications:read_updated', {
          detail: { userId, notifId, readIds: updated },
        })
      );
    }
    // Persist to server
    persistReadKeys(userId, [notifId]);
  } catch (e) {
    console.error('Failed to mark notification as read', e);
  }
};

export const markAllNotificationsAsRead = (userId: string, notifIds: string[]): void => {
  if (typeof window === 'undefined' || !userId || !notifIds.length) return;
  try {
    const current = getReadNotificationIds(userId);
    const set = new Set([...current, ...notifIds]);
    const updated = Array.from(set);
    localStorage.setItem(`ports_read_notifications_${userId}`, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent('notifications:read_updated', {
        detail: { userId, readIds: updated },
      })
    );
    // Persist to server
    persistReadKeys(userId, notifIds);
  } catch (e) {
    console.error('Failed to mark all notifications as read', e);
  }
};
