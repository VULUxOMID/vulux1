import type { Notification } from './types';

export function countsTowardUnreadNotificationBadges(notification: Notification): boolean {
  if (notification.read) {
    return false;
  }

  if (notification.type === 'friend_request' && notification.direction === 'sent') {
    return false;
  }

  return true;
}
