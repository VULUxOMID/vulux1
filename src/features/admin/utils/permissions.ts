export const ADMIN_ROLES = ['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ACTION_REQUIREMENTS = {
  VIEW_DMS: 'ADMIN',
  VIEW_USERS: 'SUPPORT',
  VIEW_SYSTEM_HEALTH: 'ADMIN',
  VIEW_INCIDENT_CENTER: 'SUPPORT',
  VIEW_MESSAGE_LOGS: 'MODERATOR',
  BAN_USER: 'MODERATOR',
  MUTE_USER: 'MODERATOR',
  MODERATE_MESSAGES: 'MODERATOR',
  CHANGE_USER_ROLE: 'OWNER',
  VIEW_SUPPORT_TICKETS: 'SUPPORT',
  RESOLVE_TICKET: 'SUPPORT',
  ADD_TICKET_NOTE: 'SUPPORT',
  ASSIGN_TICKET: 'SUPPORT',
  BULK_RESOLVE_TICKETS: 'MODERATOR',
  BULK_ASSIGN_TICKETS: 'MODERATOR',
  SET_TICKET_PRIORITY: 'ADMIN',
  EDIT_WALLET: 'ADMIN',
  BROADCAST_ALERT: 'ADMIN',
  EDIT_EVENT_CONFIG: 'ADMIN',
  UNPUBLISH_CONTENT: 'ADMIN',
  TRIGGER_SNAPSHOT: 'ADMIN',
  VIEW_AUDIT_LOGS: 'ADMIN',
  MANAGE_SYSTEM: 'OWNER',
  EXPORT_DATA: 'OWNER',
} as const satisfies Record<string, AdminRole>;

export type AdminAction = keyof typeof ADMIN_ACTION_REQUIREMENTS;

const ADMIN_ROLE_INDEX: Record<AdminRole, number> = ADMIN_ROLES.reduce(
  (accumulator, role, index) => {
    accumulator[role] = index;
    return accumulator;
  },
  {} as Record<AdminRole, number>,
);

const ADMIN_ROLE_ALIASES: Record<string, AdminRole> = {
  owner: 'OWNER',
  superadmin: 'OWNER',
  super_admin: 'OWNER',
  admin: 'ADMIN',
  moderator: 'MODERATOR',
  mod: 'MODERATOR',
  support: 'SUPPORT',
};

export type AdminPermissionMatrix = Record<AdminRole, Record<AdminAction, boolean>>;

export function normalizeAdminRole(role: unknown): AdminRole | null {
  if (typeof role !== 'string') {
    return null;
  }

  const normalizedRole = role.trim().toLowerCase();
  if (!normalizedRole) {
    return null;
  }

  return ADMIN_ROLE_ALIASES[normalizedRole] ?? null;
}

export function resolveHighestAdminRole(roles: ReadonlyArray<unknown> | null | undefined): AdminRole | null {
  if (!roles?.length) {
    return null;
  }

  return roles.reduce<AdminRole | null>((highestRole, candidateRole) => {
    const normalizedRole = normalizeAdminRole(candidateRole);
    if (!normalizedRole) {
      return highestRole;
    }

    if (!highestRole) {
      return normalizedRole;
    }

    return ADMIN_ROLE_INDEX[normalizedRole] > ADMIN_ROLE_INDEX[highestRole] ? normalizedRole : highestRole;
  }, null);
}

export function getRequiredRole(action: AdminAction): AdminRole {
  return ADMIN_ACTION_REQUIREMENTS[action];
}

export function getPermissionLabel(action: AdminAction): string {
  return `Requires ${getRequiredRole(action)}`;
}

export function can(action: AdminAction, role: unknown): boolean {
  const normalizedRole = normalizeAdminRole(role);
  if (!normalizedRole) {
    return false;
  }

  return ADMIN_ROLE_INDEX[normalizedRole] >= ADMIN_ROLE_INDEX[getRequiredRole(action)];
}

export const ADMIN_PERMISSION_MATRIX: AdminPermissionMatrix = ADMIN_ROLES.reduce(
  (roleAccumulator, role) => {
    const rolePermissions = (Object.keys(ADMIN_ACTION_REQUIREMENTS) as AdminAction[]).reduce(
      (actionAccumulator, action) => {
        actionAccumulator[action] = can(action, role);
        return actionAccumulator;
      },
      {} as Record<AdminAction, boolean>,
    );

    roleAccumulator[role] = rolePermissions;
    return roleAccumulator;
  },
  {} as AdminPermissionMatrix,
);
