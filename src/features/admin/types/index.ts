export interface AdminAction {
    id?: string;
    adminId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    payload?: Record<string, unknown>;
    result?: 'success' | 'fail';
    errorMessage?: string | null;
}

export interface AdminSession {
    lastAuthTime: number;
}

export type AdminUserAction = 'ban' | 'mute' | 'timeout' | 'shadowban';
export type AdminAssignableRole = 'user' | 'support' | 'moderator' | 'admin' | 'owner';

export interface AdminWalletBalance {
    gems: number;
    cash: number;
    fuel: number;
}

export interface AdminUserModerationFlags {
    isBanned: boolean;
    isMuted: boolean;
    isTimedOut: boolean;
    isShadowbanned: boolean;
    bannedAt: string | null;
    bannedReason: string | null;
    mutedUntil: string | null;
    timedOutUntil: string | null;
}

export interface AdminUserSummary {
    id: string;
    name: string;
    username: string;
    email: string | null;
    status: string;
    statusText: string;
    role: string;
    accountStatus: string;
    joinDate: string;
    lastActive: string;
    avatarUrl: string | null;
    wallet: AdminWalletBalance;
    moderationFlags: AdminUserModerationFlags;
}

export interface AdminAuditLogRecord {
    id: string;
    ts: string;
    actorAdminId: string;
    actorRole: string;
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    metadata: Record<string, unknown>;
    result: 'success' | 'fail';
    errorMessage: string | null;
    adminUserId: string;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface AdminReportRecord {
    id: string;
    category: string;
    priority: string;
    status: string;
    assigneeAdminId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminWalletHistoryRecord {
    id: string;
    adminUserId: string;
    reason: string;
    delta: AdminWalletBalance;
    balanceBefore: AdminWalletBalance;
    balanceAfter: AdminWalletBalance;
    createdAt: string;
    metadata: Record<string, unknown>;
}

export interface AdminUserSessionDetail {
    id: string;
    deviceLabel: string;
    status: string;
    lastSeenAt: string;
    userAgent: string | null;
    ip: string | null;
    isCurrent: boolean;
}

export interface AdminPermissionFlags {
    canManageUsers: boolean;
    canAdjustWallet: boolean;
    canChangeRoles: boolean;
    canViewEmail: boolean;
    availableRoles: AdminAssignableRole[];
}

export interface AdminUserDetail {
    user: AdminUserSummary;
    moderationHistory: AdminAuditLogRecord[];
    reports: AdminReportRecord[];
    walletHistory: AdminWalletHistoryRecord[];
    sessions: AdminUserSessionDetail[];
    permissions: AdminPermissionFlags;
}
