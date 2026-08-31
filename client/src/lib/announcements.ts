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

