// Push notifications are currently disabled (expo-notifications removed to keep the build lean).
// Re-enable by installing expo-notifications and expo-task-manager and restoring this file.

export function setupNotificationHandler(): void {
  // no-op
}

export async function registerForPushNotifications(_uid: string): Promise<void> {
  // no-op
}

export function addNotificationResponseListener(
  _handler: (teacherId: string) => void
): { remove: () => void } {
  return { remove: () => {} };
}
