import type { Ionicons } from '@expo/vector-icons';

export type ActionId = 'reply' | 'copy' | 'edit' | 'delete' | 'report';

export type ActionTone = 'brand' | 'neutral' | 'primary' | 'danger';

export type ActionItem = {
  id: ActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ActionTone;
};

export function resolveMessageActionItems(
  isMine: boolean,
  supportsOwnMessageMutations = true,
): ActionItem[] {
  const base: ActionItem[] = [
    { id: 'reply', label: 'Reply', icon: 'return-up-back', tone: 'brand' },
    { id: 'copy', label: 'Copy', icon: 'copy-outline', tone: 'neutral' },
  ];
  if (isMine) {
    if (supportsOwnMessageMutations) {
      base.push({ id: 'edit', label: 'Edit', icon: 'pencil-outline', tone: 'primary' });
      base.push({ id: 'delete', label: 'Delete', icon: 'trash-outline', tone: 'danger' });
    }
    return base;
  }

  base.push({ id: 'report', label: 'Report', icon: 'flag-outline', tone: 'danger' });
  return base;
}
