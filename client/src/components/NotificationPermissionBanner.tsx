'use client';

import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BellOff } from 'lucide-react';
import {
  getNotificationPermissionStatus, NotificationPermissionStatus,
  registerPushNotifications, requestNotificationPermissions,
} from '../lib/notifications';
import { openNotificationSettings } from '../lib/notificationSettings';

export function NotificationPermissionBanner() {
  const [status, setStatus] = useState<NotificationPermissionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const refresh = async () => {
      const next = await getNotificationPermissionStatus();
      if (active) { setStatus(next); setError(''); }
      if (active && next.state === 'granted') void registerPushNotifications(false);
    };
    const onPermissionChanged = (event: Event) => {
      if (active) setStatus((event as CustomEvent<NotificationPermissionStatus>).detail);
    };
    window.addEventListener('ports:notification_permission_changed', onPermissionChanged);
    const appListener = App.addListener('appStateChange', (state) => {
      if (state.isActive) void refresh();
    });
    void refresh();
    return () => {
      active = false;
      window.removeEventListener('ports:notification_permission_changed', onPermissionChanged);
      void appListener.then((listener) => listener.remove()).catch(() => {});
    };
  }, []);

  if (!status || status.state === 'granted' || status.state === 'unsupported') return null;

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      if (status.state === 'unknown') {
        setStatus(await getNotificationPermissionStatus());
      } else if (status.canRequest) {
        if (await requestNotificationPermissions()) await registerPushNotifications(false);
        setStatus(await getNotificationPermissionStatus());
      } else {
        await openNotificationSettings();
      }
    } catch {
      setError('افتح إعدادات الهاتف ← التطبيقات ← منظومة الموانئ ← الإشعارات، ثم اسمح بها.');
    } finally { setBusy(false); }
  };

  return (
    <div role="status" aria-live="polite" className="border-b border-amber-200 bg-amber-50 px-3 py-3 text-[#0c3e35]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-start gap-2">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="font-bold">{status.state === 'unknown' ? 'تعذّر التحقق من إذن الإشعارات' : 'فعّل إشعارات الهاتف'}</p>
            <p className="mt-1 text-xs">لتصلك التعاميم والتكليفات حتى أثناء إغلاق التطبيق، اسمح بالإشعارات على هذا الهاتف.</p>
            {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
          </div>
        </div>
        <button type="button" disabled={busy} onClick={enable}
          className="rounded-lg bg-[#0c3e35] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
          {busy ? 'جاري التحقق...' : status.state === 'unknown' ? 'إعادة المحاولة'
            : status.canRequest ? 'تفعيل الإشعارات' : 'فتح إعدادات الإشعارات'}
        </button>
      </div>
    </div>
  );
}
