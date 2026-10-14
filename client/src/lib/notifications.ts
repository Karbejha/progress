'use client';

import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications, Channel } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '../services/api';
import { isNotificationForUser, normalizeNotificationPayload, toNotificationIntegerId } from './notificationPayload';

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
  userId?: string;
  type?: string;
  title: string;
  message?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: string;
}

const DEVICE_TOKEN_KEY = 'ports_device_token';
const CHANNELS: Channel[] = [
  {
    id: 'ports_announcements',
    name: 'التعاميم والتوجيهات الإدارية الرسمية',
    description: 'التعاميم الإدارية الصادرة عن المديرية العامة للموانئ',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#0c3e35',
  },
  {
    id: 'ports_urgent',
    name: 'التكاليف والتنبيهات العاجلة',
    description: 'التكاليف التنفيذية والملاحظات الإدارية العاجلة',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#d4af37',
  },
];

let initialization: Promise<void> | null = null;
let permissionRequest: Promise<boolean> | null = null;
let registration: Promise<void> | null = null;
let deviceSync: Promise<void> | null = null;
let deviceSyncKey = '';
let deviceSyncAttempts = 0;
let registeredSession = '';
let nativeOperations = Promise.resolve();
let nativeAppActive = true;
let pendingClick: Record<string, any> | null = null;
let clickSubscribers = 0;
const displayedNotifications = new Set<string>();

function authenticatedSession(): string {
  const token = api.getToken();
  const userId = api.getCurrentUser()?.id;
  return token && userId ? `${userId}:${token}` : '';
}

function belongsToCurrentUser(payload: { userId?: string }): boolean {
  return Boolean(api.getToken()) && isNotificationForUser(payload, api.getCurrentUser()?.id);
}

function dispatchNotificationClick(detail: Record<string, any>): void {
  if (!belongsToCurrentUser(detail)) return;
  if (!clickSubscribers) {
    pendingClick = detail;
    return;
  }
  window.dispatchEvent(new CustomEvent('ports:notification_clicked', { detail }));
}

/** Mount the authenticated Header listener before draining a cold-start notification tap. */
export function subscribeToNotificationClicks(
  listener: (event: CustomEvent<Record<string, any>>) => void,
): () => void {
  const handler = listener as EventListener;
  window.addEventListener('ports:notification_clicked', handler);
  clickSubscribers++;
  if (pendingClick) {
    const detail = pendingClick;
    pendingClick = null;
    if (belongsToCurrentUser(detail)) listener(new CustomEvent('ports:notification_clicked', { detail }));
  }
  return () => {
    window.removeEventListener('ports:notification_clicked', handler);
    clickSubscribers = Math.max(0, clickSubscribers - 1);
  };
}

async function syncDeviceToken(): Promise<void> {
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  const session = authenticatedSession();
  const syncKey = `${session}:${token}`;
  if (deviceSync) {
    // A refreshed token or a new account must be bound after the previous request finishes.
    return deviceSyncKey === syncKey ? deviceSync : deviceSync.then(() => syncDeviceToken());
  }
  if (!token || !session || registeredSession === `${session}:${token}`) return;
  deviceSyncKey = syncKey;
  deviceSyncAttempts++;
  deviceSync = (async () => {
    const success = await api.registerDeviceToken(token, Capacitor.getPlatform());
    if (success && authenticatedSession() === session && localStorage.getItem(DEVICE_TOKEN_KEY) === token) {
      registeredSession = `${session}:${token}`;
    }
  })().finally(() => { deviceSync = null; deviceSyncKey = ''; });
  return deviceSync;
}

function queueNativeOperation(operation: () => Promise<void>): Promise<void> {
  const next = nativeOperations.then(operation, operation);
  nativeOperations = next.catch(() => undefined);
  return next;
}

async function detachNativeDevice(): Promise<void> {
  registeredSession = '';
  pendingClick = null;
  displayedNotifications.clear();
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  await queueNativeOperation(async () => {
    // Rotate the FCM token even if the server is offline during logout.
    await PushNotifications.unregister().catch(() => {
      console.warn('Could not unregister native push notifications.');
    });
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    await Promise.allSettled([
      PushNotifications.removeAllDeliveredNotifications(),
      LocalNotifications.removeAllDeliveredNotifications(),
    ]);
  });
}

async function initializeNativeService(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const listeners: PluginListenerHandle[] = [];
    try {
      if (Capacitor.getPlatform() === 'android') {
        // Push and local notifications share these Android system channels.
        for (const channel of CHANNELS) {
          // Channels are unavailable on Android 7 (the app's supported minimum is API 24).
          await LocalNotifications.createChannel(channel).catch(() => {
            console.warn('Could not configure an Android notification channel.');
          });
        }
      }
      nativeAppActive = (await App.getState()).isActive;
      // Listeners must exist before register() emits a token or replays a cold-start tap.
      listeners.push(await PushNotifications.addListener('registration', (token) => {
        if (!authenticatedSession()) return;
        localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
        void syncDeviceToken().catch(() => {
          console.warn('Could not bind the native push token; registration will retry.');
        });
      }));
      listeners.push(await PushNotifications.addListener('registrationError', () => {
        console.warn('Native push notification registration failed.');
      }));
      listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const detail = normalizeNotificationPayload(notification.data, notification);
        if (!detail || !belongsToCurrentUser(detail)) return;
        // Native foreground presentation is disabled: FCM and socket delivery share this ID.
        void notifyGeneric(detail as GenericNotificationPayload);
        window.dispatchEvent(new CustomEvent('ports:push_received', { detail }));
      }));
      listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const detail = normalizeNotificationPayload(action.notification.data, action.notification);
        if (detail) dispatchNotificationClick(detail);
      }));
      listeners.push(await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const detail = normalizeNotificationPayload(action.notification.extra, action.notification);
        if (detail) dispatchNotificationClick(detail);
      }));
      listeners.push(await App.addListener('appStateChange', (state) => {
        nativeAppActive = state.isActive;
        if (state.isActive) void registerPushNotifications(false);
      }));
      window.addEventListener('ports:auth_changed', (event) => {
        const loggedOut = (event as CustomEvent<{ authenticated: boolean }>).detail?.authenticated === false;
        if (loggedOut) void detachNativeDevice();
        else if (registration) void registration.then(() => registerPushNotifications());
        else void registerPushNotifications();
      });
      // Retry backend binding after transient connectivity failures without another permission prompt.
      window.setInterval(() => {
        if (nativeAppActive && authenticatedSession()) void registerPushNotifications(false);
      }, 60000);
    } catch (error) {
      await Promise.allSettled(listeners.map((listener) => listener.remove()));
      initialization = null;
      throw error;
    }
  })();
  return initialization;
}

/** Initializes once; calling again after login binds the token to that authenticated session. */
export async function initNotificationService(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  try {
    await initializeNativeService();
    if (authenticatedSession()) await registerPushNotifications();
  } catch {
    console.warn('Could not initialize native notification service.');
  }
}

export async function registerPushNotifications(requestPermission = true): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  if (registration) return registration;
  registration = (async () => {
    await initializeNativeService();
    const session = authenticatedSession();
    if (!session) return;
    const permitted = requestPermission
      ? await requestNotificationPermissions()
      : (await LocalNotifications.checkPermissions()).display === 'granted'
        && (await PushNotifications.checkPermissions()).receive === 'granted';
    if (!permitted || authenticatedSession() !== session) return;
    const previousSyncAttempts = deviceSyncAttempts;
    await queueNativeOperation(async () => {
      if (authenticatedSession() !== session) return;
      // Recheck the native token on resume/retry: it can rotate outside this JS session.
      await PushNotifications.register();
    });
    // Network binding must not hold the native queue and delay token deletion during logout.
    if (authenticatedSession() === session) {
      if (deviceSyncAttempts === previousSyncAttempts) await syncDeviceToken();
      else if (deviceSync) await deviceSync;
    }
  })().catch(() => {
    console.warn('Could not register native push notifications; registration will retry.');
  }).finally(() => { registration = null; });
  return registration;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (permissionRequest) return permissionRequest;
  permissionRequest = (async () => {
    if (Capacitor.isNativePlatform()) {
      let local = await LocalNotifications.checkPermissions();
      if (local.display === 'prompt' || local.display === 'prompt-with-rationale') {
        local = await LocalNotifications.requestPermissions();
      }
      if (local.display !== 'granted') return false;
      let push = await PushNotifications.checkPermissions();
      if (push.receive === 'prompt' || push.receive === 'prompt-with-rationale') {
        push = await PushNotifications.requestPermissions();
      }
      return push.receive === 'granted';
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') return (await Notification.requestPermission()) === 'granted';
    }
    return false;
  })().catch(() => false).finally(() => { permissionRequest = null; });
  return permissionRequest;
}

/** One system notification for one canonical database notification, across push and socket delivery. */
export async function notifyGeneric(item: GenericNotificationPayload): Promise<void> {
  if (typeof window === 'undefined' || !item?.id || !belongsToCurrentUser(item)) return;
  const native = Capacitor.isNativePlatform();
  // FCM notification payloads are displayed by Android while the app is in the background.
  if (native && (!nativeAppActive || document.visibilityState === 'hidden')) return;
  const session = authenticatedSession();
  const userId = api.getCurrentUser()!.id;
  const key = `${userId}:${item.id}`;
  if (displayedNotifications.has(key)) return;
  displayedNotifications.add(key);
  if (displayedNotifications.size > 1000) displayedNotifications.delete(displayedNotifications.values().next().value!);
  const detail = normalizeNotificationPayload({ ...item, userId })!;
  try {
    if (native) {
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') {
        displayedNotifications.delete(key);
        return;
      }
      if (authenticatedSession() !== session || !nativeAppActive || document.visibilityState === 'hidden') {
        displayedNotifications.delete(key);
        return;
      }
      await LocalNotifications.schedule({
        notifications: [{
          id: toNotificationIntegerId(item.id),
          title: item.title || 'إشعار إداري جديد',
          body: item.message || '',
          channelId: detail.type === 'announcement' && detail.priority !== 'URGENT' && detail.priority !== 'HIGH'
            ? 'ports_announcements' : 'ports_urgent',
          smallIcon: 'ic_stat_notification',
          iconColor: '#0c3e35',
          autoCancel: true,
          extra: detail,
        }],
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(item.title || 'إشعار إداري جديد', {
        body: item.message || '', icon: '/icon.png', badge: '/icon.png', tag: `ports-${item.id}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        dispatchNotificationClick(detail);
      };
    } else {
      displayedNotifications.delete(key);
    }
  } catch {
    displayedNotifications.delete(key);
    console.warn('Could not display a system notification.');
  }
}

export async function notifyCircular(payload: AnnouncementNotificationPayload): Promise<void> {
  return notifyGeneric({ id: `announcement-${payload.id}`, referenceId: payload.id,
    type: 'announcement', title: payload.title, message: payload.content,
    metadata: { ...payload }, createdAt: payload.createdAt });
}

export async function notifyExecutiveTask(payload: ExecutiveTaskNotificationPayload): Promise<void> {
  return notifyGeneric({ id: `executive-task-${payload.id}`, referenceId: payload.id,
    type: 'executive-task', title: 'تكليف إداري جديد', message: payload.title, metadata: { ...payload } });
}

export async function notifyFeedback(payload: FeedbackNotificationPayload): Promise<void> {
  return notifyGeneric({ id: `feedback-${Date.now()}`, type: 'feedback', title: 'توجيه وملاحظة إدارية',
    message: payload.feedbackText, metadata: { ...payload } });
}
