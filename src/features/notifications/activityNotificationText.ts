import type { ActivityNotification } from './types';

function getGroupedActorLabel(item: ActivityNotification): string | null {
  if (!item.groupCount || item.groupCount <= 1) {
    return null;
  }
  const groupedNames = item.groupedNames ?? [];
  if (groupedNames.length === 0) {
    return null;
  }
  return groupedNames.length === 1 ? groupedNames[0] : `${groupedNames.length}`;
}

export function shouldPrefixActivityActor(item: ActivityNotification): boolean {
  return item.activityType !== 'event';
}

export function getActivityNotificationAccessibilityText(item: ActivityNotification): string {
  if (!shouldPrefixActivityActor(item)) {
    return item.message;
  }

  const parts: string[] = [];
  if (item.fromUser?.name) {
    parts.push(item.fromUser.name);
  }

  const groupedLabel = getGroupedActorLabel(item);
  if (groupedLabel) {
    parts.push(`plus ${groupedLabel}`);
  }

  parts.push(item.message);
  return parts.join(' ').trim();
}
