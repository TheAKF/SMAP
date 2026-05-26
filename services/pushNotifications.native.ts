// Native-only implementation — used on iOS & Android.
// The web stub (pushNotifications.ts) is used on web.

import * as Notifications from 'expo-notifications';
import { savePushToken } from './firestore';

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushNotifications(uid: string): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
    if (!tokenData) return;

    await savePushToken(uid, tokenData.data);
  } catch (_) {}
}

export function addNotificationResponseListener(
  handler: (teacherId: string) => void
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (data?.type === 'teacher_poll' && typeof data.teacherId === 'string') {
      handler(data.teacherId);
    }
  });
}
