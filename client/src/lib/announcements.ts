'use client';

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
  } catch (e) {
    console.error('Failed to mark all announcements as read', e);
  }
};

// Generic Notification Read Helpers (for Tasks, Plans, Summaries, Feedback)
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
  } catch (e) {
    console.error('Failed to mark all notifications as read', e);
  }
};
