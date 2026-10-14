import { Capacitor, registerPlugin } from '@capacitor/core';

const NotificationSettings = registerPlugin<{ open(): Promise<void> }>('PortsNotificationSettings');

export async function openNotificationSettings(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') throw new Error('Notification settings are unavailable');
  await NotificationSettings.open();
}
