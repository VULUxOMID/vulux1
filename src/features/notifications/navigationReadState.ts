import type { Notification } from './types';

export function shouldMarkNotificationReadBeforeNavigation(
  actionType: string,
  notificationId: string,
  notifications: Notification[],
): boolean {
  if (actionType !== 'navigation') {
    return false;
  }

  const normalizedId = notificationId.trim();
  if (!normalizedId) {
    return false;
  }

  const notification = notifications.find((item) => item.id === normalizedId);
  return Boolean(notification && !notification.read);
}
