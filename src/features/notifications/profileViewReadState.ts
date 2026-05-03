import type { Notification } from './types';

export function getUnreadProfileViewNotificationIds(
  notifications: Notification[],
): string[] {
  return notifications
    .filter(
      (notification): notification is Extract<Notification, { type: 'profile_view' }> =>
        notification.type === 'profile_view' && !notification.read,
    )
    .map((notification) => notification.id);
}
