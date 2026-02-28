import { apiClient } from '../../../data/api';
import type {
    AdminAssignableRole,
    AdminAuditLogRecord,
    AdminUserAction,
    AdminUserDetail,
    AdminWalletBalance,
    AdminWalletHistoryRecord,
} from '../types';

type QueryParams = Record<string, unknown>;

export type WalletAdjustmentOperation = 'add' | 'remove' | 'set';

export type AdminRequestClient = {
    get: <T = any>(path: string, params?: QueryParams) => Promise<T>;
    post: <T = any>(path: string, body?: unknown) => Promise<T>;
};

type UserDetailResponse = {
    ok: boolean;
    userDetail: AdminUserDetail;
};

type AuditLogResponse = {
    ok: boolean;
    logs: AdminAuditLogRecord[];
    page: number;
    limit: number;
    hasMore: boolean;
};

export type ModerationScope = 'all' | 'global' | 'dm';
export type FlaggedState = 'all' | 'flagged' | 'clean';

export type AdminModerationPermissions = {
    canViewDms: boolean;
    canManageUsers: boolean;
    canModerateGlobalChat: boolean;
    canGrantCurrency: boolean;
    canManageSystem: boolean;
    canExportData: boolean;
};

export type ModerationContextMessage = {
    id: string;
    senderId: string;
    user: string;
    text: string;
    type: string;
    createdAt: number;
};

export type ModerationReportRecord = {
    id: string;
    scope: 'global' | 'dm';
    status: string;
    reason: string;
    messageId: string;
    reportedUserId: string | null;
    contextKey: string | null;
    linkedTicketId: string | null;
    escalatedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

export type ModerationMessageRecord = {
    id: string;
    scope: 'global' | 'dm';
    roomId: string | null;
    contextKey: string | null;
    conversationUserIds: string[];
    senderId: string;
    user: string;
    text: string;
    type: string;
    createdAt: number;
    isFlagged: boolean;
    reports: ModerationReportRecord[];
    primaryReportId: string | null;
    contextPreview: ModerationContextMessage[];
};

type ModerationPermissionsResponse = {
    ok: boolean;
    role: string;
    permissions: AdminModerationPermissions;
};

type ModerationMessagesResponse = {
    ok: boolean;
    role: string;
    permissions: AdminModerationPermissions;
    messages: ModerationMessageRecord[];
};

type ModerationMessageDetailResponse = {
    ok: boolean;
    role: string;
    permissions: AdminModerationPermissions;
    message: ModerationMessageRecord;
};

function getClient(client?: AdminRequestClient): AdminRequestClient {
    return client ?? apiClient;
}

export class ModerationService {
    static async getAuditLogs(params?: QueryParams, client?: AdminRequestClient) {
        return getClient(client).get<AuditLogResponse>('/admin/audit_logs', params);
    }

    static async getModerationPermissions(client?: AdminRequestClient) {
        return getClient(client).get<ModerationPermissionsResponse>('/admin/moderation/permissions');
    }

    static async listModerationMessages(
        filters: {
            scope: ModerationScope;
            keyword?: string;
            user?: string;
            dateFrom?: string;
            dateTo?: string;
            flaggedState?: FlaggedState;
            limit?: number;
        },
        client?: AdminRequestClient
    ) {
        return getClient(client).get<ModerationMessagesResponse>('/admin/moderation/messages', filters);
    }

    static async getModerationMessageDetail(
        messageId: string,
        scope: ModerationScope,
        client?: AdminRequestClient
    ) {
        return getClient(client).get<ModerationMessageDetailResponse>(
            `/admin/moderation/messages/${encodeURIComponent(messageId)}`,
            { scope }
        );
    }

    static async getUserDetail(userId: string, client?: AdminRequestClient) {
        return getClient(client).get<UserDetailResponse>(
            `/admin/users/${encodeURIComponent(userId)}/detail`
        );
    }

    static async moderateUser(
        {
            userId,
            action,
            reason,
            durationMs,
        }: {
            userId: string;
            action: AdminUserAction;
            reason: string;
            durationMs?: number;
        },
        client?: AdminRequestClient
    ) {
        return getClient(client).post('/admin/moderate/user', {
            userId,
            action,
            duration: durationMs,
            reason,
        });
    }

    static async updateUserRole(
        {
            userId,
            role,
            reason,
        }: {
            userId: string;
            role: AdminAssignableRole;
            reason: string;
        },
        client?: AdminRequestClient
    ) {
        return getClient(client).post(
            `/admin/users/${encodeURIComponent(userId)}/role`,
            {
                reason,
                role,
            }
        );
    }

    static async adjustWallet(
        {
            userId,
            delta,
            reason,
        }: {
            userId: string;
            delta: Partial<AdminWalletBalance>;
            reason: string;
        },
        client?: AdminRequestClient
    ) {
        const requestClient = getClient(client);
        const entries = Object.entries(delta).filter(
            ([, value]) => typeof value === 'number' && Number.isFinite(value) && value !== 0
        ) as Array<[keyof AdminWalletBalance, number]>;

        if (entries.length === 0) {
            throw new Error('At least one wallet delta is required.');
        }

        let lastResponse: { ok: boolean; transaction?: AdminWalletHistoryRecord } | null = null;

        for (const [currency, amount] of entries) {
            lastResponse = await requestClient.post('/admin/wallet/adjust', {
                amount: Math.abs(amount),
                currency,
                operation: amount > 0 ? 'add' : 'remove',
                reason,
                userId,
            });
        }

        return lastResponse ?? { ok: true };
    }

    static async moderateMessage(
        {
            messageId,
            scope,
            leaveTombstone,
            reason,
            conversationUserIds,
        }: {
            messageId: string;
            scope: Exclude<ModerationScope, 'all'>;
            leaveTombstone: boolean;
            reason: string;
            conversationUserIds?: string[];
        },
        client?: AdminRequestClient
    ) {
        return getClient(client).post('/admin/moderate/message', {
            messageId,
            scope,
            leaveTombstone,
            reason,
            conversationUserIds,
        });
    }

    static async deleteMessage(
        messageId: string,
        scope: Exclude<ModerationScope, 'all'>,
        reason: string,
        conversationUserIds?: string[],
        client?: AdminRequestClient
    ) {
        return this.moderateMessage(
            {
                messageId,
                scope,
                leaveTombstone: false,
                reason,
                conversationUserIds,
            },
            client
        );
    }

    static async escalateReport(
        {
            reportId,
            scope,
            messageId,
            reportedUserId,
            contextKey,
            reason,
        }: {
            reportId?: string;
            scope: Exclude<ModerationScope, 'all'>;
            messageId?: string;
            reportedUserId?: string;
            contextKey?: string | null;
            reason: string;
        },
        client?: AdminRequestClient
    ) {
        return getClient(client).post('/admin/moderate/report', {
            reportId,
            scope,
            messageId,
            reportedUserId,
            contextKey,
            reason,
        });
    }

    static async endStream(liveId: string, reason?: string) {
        return apiClient.post('/admin/live/end', {
            liveId,
            reason,
        });
    }

    static async clearGlobalChat(reason: string) {
        return apiClient.post('/admin/messages/clear', {
            roomId: 'global',
            reason,
        });
    }

    static async adjustWalletLegacy({
        userId,
        currency,
        amount,
        operation,
        reason,
    }: {
        userId: string;
        currency: string;
        amount: number;
        operation: WalletAdjustmentOperation;
        reason: string;
    }) {
        return apiClient.post('/admin/wallet/adjust', {
            userId,
            currency,
            amount,
            operation,
            reason,
        });
    }
}
