import { Ionicons } from '@expo/vector-icons';
import { type AdminAction } from './utils/permissions';

export type AdminTabId =
  | 'operations'
  | 'health'
  | 'incidents'
  | 'users'
  | 'moderation'
  | 'reports'
  | 'finance'
  | 'events'
  | 'contentOps'
  | 'support'
  | 'exports'
  | 'auditLogs'
  | 'system';

export type AdminTabDefinition = {
  id: AdminTabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  requiredAction?: AdminAction;
};

export const ADMIN_TABS: AdminTabDefinition[] = [
  { id: 'operations', label: 'Operations', icon: 'pulse' },
  { id: 'health', label: 'Health', icon: 'pulse', requiredAction: 'VIEW_SYSTEM_HEALTH' },
  { id: 'incidents', label: 'Incidents', icon: 'alert-circle', requiredAction: 'VIEW_INCIDENT_CENTER' },
  { id: 'users', label: 'Users', icon: 'people', requiredAction: 'VIEW_USERS' },
  { id: 'moderation', label: 'Moderation', icon: 'shield-checkmark', requiredAction: 'VIEW_MESSAGE_LOGS' },
  { id: 'reports', label: 'Reports', icon: 'flag', requiredAction: 'VIEW_MESSAGE_LOGS' },
  { id: 'finance', label: 'Finance', icon: 'wallet', requiredAction: 'EDIT_WALLET' },
  { id: 'events', label: 'Events', icon: 'calendar', requiredAction: 'EDIT_EVENT_CONFIG' },
  { id: 'contentOps', label: 'Content Ops', icon: 'play', requiredAction: 'UNPUBLISH_CONTENT' },
  { id: 'support', label: 'Support', icon: 'help-buoy', requiredAction: 'VIEW_SUPPORT_TICKETS' },
  { id: 'exports', label: 'Exports', icon: 'download', requiredAction: 'EXPORT_DATA' },
  { id: 'auditLogs', label: 'Audit Logs', icon: 'receipt', requiredAction: 'VIEW_AUDIT_LOGS' },
  { id: 'system', label: 'System', icon: 'hardware-chip', requiredAction: 'TRIGGER_SNAPSHOT' },
];
