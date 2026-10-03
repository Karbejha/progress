'use client';

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '../services/api';

export interface AnnouncementNotificationPayload {
  id: string;
  title: string;
  content: string;
  authorName?: string;
  authorTitle?: string;
  priority?: string;
  createdAt?: string;
}

export interface ExecutiveTaskNotificationPayload {
  id: string;
  title: string;
  directorateName?: string;
  assignedByName?: string;
  isShared?: boolean;
}

export interface FeedbackNotificationPayload {
  directorateId?: string;
  fromUserName?: string;
  feedbackText: string;
  rating?: number;
}

export interface GenericNotificationPayload {
  id: string;
  type?: string;
  title: string;
  message?: string;
  referenceId?: string;
  metadata?: any;
  createdAt?: string;
}

const CHANNELS: Channel[] = [
  {
    id: 'ports_announcements',
    name: 'التعاميم والتوجيهات الإدارية الرسمية',
    description: 'إشعارات التعاميم الإدارية الصادرة من الإدارة العليا للمديرية العامة للموانئ',
    importance: 5, // MAX importance for heads-up banner & sound
    visibility: 1, // Public on lock screen
    sound: undefined, // Default system notification sound
    vibration: true,
    lights: true,
    lightColor: '#0c3e35',
  },
  {
    id: 'ports_urgent',
    name: 'التكاليف والتنبيهات العاجلة',
    description: 'إشعارات التكاليف التنفيذية المباشرة والملاحظات الإدارية الطارئة',
    importance: 5,
    visibility: 1,
    sound: undefined,
    vibration: true,
    lights: true,
    lightColor: '#d4af37',
  },
];

let isInitialized = false;

/**
 * Convert string ID or hash to a 32-bit positive integer required by Android notification IDs
 */
function toIntegerId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 2147483647);
}

/**
 * Register with FCM (Firebase Cloud Messaging) for native push notifications
 */
export async function registerPushNotifications(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

  try {
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      const res = await PushNotifications.requestPermissions();
      if (res.receive !== 'granted') return;
    } else if (permStatus.receive !== 'granted') {
      return;
    }

    // Register with FCM / APNs
    await PushNotifications.register();

    // Listeners for token registration
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener('registration', async (token) => {
      console.log('FCM Device Token registered:', token.value);
      try {
        await api.registerDeviceToken(token.value, Capacitor.getPlatform());
        localStorage.setItem('ports_device_token', token.value);
      } catch (err) {
        console.warn('Failed to register device token on backend:', err);
      }
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.warn('FCM registration error:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('FCM push received in foreground:', notification);
      window.dispatchEvent(
        new CustomEvent('ports:push_received', { detail: notification })
      );
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('User tapped push notification:', action);
      const data = action.notification.data;
      if (data) {
        window.dispatchEvent(
          new CustomEvent('ports:notification_clicked', { detail: data })
        );
      }
    });
  } catch (err) {
    console.warn('Could not initialize push notifications plugin:', err);
  }
}

/**
 * Initialize Android notification channels and tap action listeners
 */
export async function initNotificationService(): Promise<void> {
  if (typeof window === 'undefined' || isInitialized) return;

  try {
    if (Capacitor.isNativePlatform()) {
      // Create high-priority Android notification channels
      for (const ch of CHANNELS) {
        await LocalNotifications.createChannel(ch).catch((err) => {
          console.warn(`Failed to create channel ${ch.id}:`, err);
        });
      }

      // Handle user clicking the notification banner on Android
      await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (notificationAction) => {
          const extra = notificationAction.notification.extra;
          if (extra) {
            window.dispatchEvent(
              new CustomEvent('ports:notification_clicked', { detail: extra })
            );
          }
        }
      );

      // Register for FCM Push Notifications
      registerPushNotifications().catch((err) => {
        console.warn('FCM Push registration deferred:', err);
      });
    }

    isInitialized = true;
  } catch (e) {
    console.error('Error initializing notification service:', e);
  }
}

/**
 * Request notification permissions from Android 13+ or web browser
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') {
        return true;
      }
      const requestRes = await LocalNotifications.requestPermissions();
      return requestRes.display === 'granted';
    } else if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
    }
  } catch (e) {
    console.warn('Could not request notification permissions:', e);
  }

  return false;
}

/**
 * Dispatch an official Circular (تعميم) notification to the phone's notification bar
 */
export async function notifyCircular(payload: AnnouncementNotificationPayload): Promise<void> {
  if (typeof window === 'undefined') return;

  const isUrgent = payload.priority === 'URGENT' || payload.priority === 'HIGH';
  const prefix = isUrgent ? '🚨 تعميم إداري عاجل' : '📢 تعميم إداري رسمي';
  const notifTitle = `${prefix}: ${payload.title}`;
  const senderText = payload.authorName ? `صادر عن: ${payload.authorName}` : 'المدير العام للموانئ';
  const bodyText = `${senderText}\n${payload.content ? payload.content.slice(0, 140) : ''}`;
  const notifId = toIntegerId(`announcement-${payload.id}`);

  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: notifTitle,
            body: bodyText,
            channelId: isUrgent ? 'ports_urgent' : 'ports_announcements',
            smallIcon: 'ic_launcher_round',
            iconColor: '#0c3e35',
            autoCancel: true,
            extra: {
              type: 'announcement',
              id: payload.id,
              title: payload.title,
              content: payload.content,
              authorName: payload.authorName,
              authorTitle: payload.authorTitle,
              priority: payload.priority,
              createdAt: payload.createdAt || new Date().toISOString(),
            },
          },
        ],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const webNotif = new Notification(notifTitle, {
        body: bodyText,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `circular-${payload.id}`,
        requireInteraction: isUrgent,
      });

      webNotif.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent('ports:notification_clicked', {
            detail: {
              type: 'announcement',
              id: payload.id,
              title: payload.title,
              content: payload.content,
              authorName: payload.authorName,
              authorTitle: payload.authorTitle,
              priority: payload.priority,
              createdAt: payload.createdAt || new Date().toISOString(),
            },
          })
        );
      };
    }
  } catch (err) {
    console.error('Failed to dispatch circular notification:', err);
  }
}

/**
 * Dispatch an Executive Task (تكليف إداري) notification to the phone's notification bar
 */
export async function notifyExecutiveTask(payload: ExecutiveTaskNotificationPayload): Promise<void> {
  if (typeof window === 'undefined') return;

  const notifTitle = payload.isShared
    ? '📌 تكليف إداري مشترك من المدير العام'
    : '📌 تكليف جديد من المدير العام للموانئ';
  const bodyText = `وردك تكليف رسمي: "${payload.title}"`;
  const notifId = toIntegerId(`exec-task-${payload.id}`);

  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: notifTitle,
            body: bodyText,
            channelId: 'ports_urgent',
            smallIcon: 'ic_launcher_round',
            iconColor: '#0c3e35',
            autoCancel: true,
            extra: {
              type: 'executive-task',
              id: payload.id,
              title: payload.title,
              directorateName: payload.directorateName,
              assignedByName: payload.assignedByName,
              isShared: payload.isShared,
            },
          },
        ],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const webNotif = new Notification(notifTitle, {
        body: bodyText,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `task-${payload.id}`,
      });

      webNotif.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent('ports:notification_clicked', {
            detail: {
              type: 'executive-task',
              id: payload.id,
              title: payload.title,
              directorateName: payload.directorateName,
              assignedByName: payload.assignedByName,
              isShared: payload.isShared,
            },
          })
        );
      };
    }
  } catch (err) {
    console.error('Failed to dispatch executive task notification:', err);
  }
}

/**
 * Dispatch a Feedback (توجيه وملاحظة) notification to the phone's notification bar
 */
export async function notifyFeedback(payload: FeedbackNotificationPayload): Promise<void> {
  if (typeof window === 'undefined') return;

  const notifTitle = '💬 توجيه وملاحظة من المدير العام';
  const bodyText = `${payload.fromUserName ? `${payload.fromUserName}: ` : ''}${payload.feedbackText}`;
  const notifId = toIntegerId(`feedback-${Date.now()}`);

  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: notifTitle,
            body: bodyText,
            channelId: 'ports_urgent',
            smallIcon: 'ic_launcher_round',
            iconColor: '#0c3e35',
            autoCancel: true,
            extra: {
              type: 'feedback',
              feedbackText: payload.feedbackText,
              fromUserName: payload.fromUserName,
              rating: payload.rating,
            },
          },
        ],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const webNotif = new Notification(notifTitle, {
        body: bodyText,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `feedback-${Date.now()}`,
      });

      webNotif.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent('ports:notification_clicked', {
            detail: {
              type: 'feedback',
              feedbackText: payload.feedbackText,
              fromUserName: payload.fromUserName,
              rating: payload.rating,
            },
          })
        );
      };
    }
  } catch (err) {
    console.error('Failed to dispatch feedback notification:', err);
  }
}

/**
 * Dispatch any notification (Circular, Executive Task, Feedback, Plan, Summary, or Generic Note)
 * to the mobile notification bar with maximum priority, sound, and heads-up banner.
 */
export async function notifyGeneric(item: GenericNotificationPayload): Promise<void> {
  if (typeof window === 'undefined' || !item) return;

  const notifType = (item.type || '').toLowerCase();

  // If announcement / circular
  if (notifType === 'announcement' || notifType.includes('circular')) {
    return notifyCircular({
      id: item.referenceId || item.id,
      title: item.title,
      content: item.message || item.title || '',
      authorName: item.metadata?.authorName,
      authorTitle: item.metadata?.authorTitle,
      priority: item.metadata?.priority || 'HIGH',
      createdAt: item.createdAt,
    });
  }

  // If executive task
  if (notifType.includes('task') || notifType === 'executive-task') {
    return notifyExecutiveTask({
      id: item.referenceId || item.id,
      title: item.title,
      directorateName: item.metadata?.directorateName,
      assignedByName: item.metadata?.assignedByName || item.metadata?.authorName,
      isShared: item.metadata?.isShared,
    });
  }

  // If feedback / note
  if (notifType.includes('feedback') || notifType.includes('note')) {
    return notifyFeedback({
      directorateId: item.metadata?.directorateId,
      fromUserName: item.metadata?.fromUserName || item.metadata?.authorName,
      feedbackText: item.message || item.title,
      rating: item.metadata?.rating,
    });
  }

  // General Notification fallback
  const notifId = toIntegerId(`generic-${item.id}`);
  const notifTitle = item.title || 'إشعار إداري رسمي جديد';
  const bodyText = item.message || '';

  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: notifTitle,
            body: bodyText,
            channelId: 'ports_urgent',
            smallIcon: 'ic_launcher_round',
            iconColor: '#0c3e35',
            autoCancel: true,
            extra: {
              type: item.type,
              id: item.id,
              referenceId: item.referenceId,
              title: item.title,
              message: item.message,
              metadata: item.metadata,
              createdAt: item.createdAt || new Date().toISOString(),
            },
          },
        ],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const webNotif = new Notification(notifTitle, {
        body: bodyText,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `generic-${item.id}`,
      });

      webNotif.onclick = () => {
        window.focus();
        window.dispatchEvent(
          new CustomEvent('ports:notification_clicked', {
            detail: {
              type: item.type,
              id: item.id,
              referenceId: item.referenceId,
              title: item.title,
              message: item.message,
              metadata: item.metadata,
              createdAt: item.createdAt || new Date().toISOString(),
            },
          })
        );
      };
    }
  } catch (err) {
    console.error('Failed to dispatch generic notification:', err);
  }
}
