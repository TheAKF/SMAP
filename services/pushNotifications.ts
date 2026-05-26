// Web stub — expo-notifications doesn't run on web.
// Metro picks pushNotifications.native.ts on iOS/Android automatically.

export async function registerForPushNotifications(_uid: string): Promise<void> {}

export function addNotificationResponseListener(
  _handler: (teacherId: string) => void
): { remove: () => void } {
  return { remove: () => {} };
}

export function setupNotificationHandler(): void {}
