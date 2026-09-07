'use client';

import { api } from '../services/api';

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
    api.markNotificationsRead([announcementId]).catch(() => {});
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
    api.markNotificationsRead(announcementIds).catch(() => {});
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
    api.markNotificationsRead([notifId]).catch(() => {});
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
    api.markNotificationsRead(notifIds).catch(() => {});
  } catch (e) {
    console.error('Failed to mark all notifications as read', e);
  }
};
