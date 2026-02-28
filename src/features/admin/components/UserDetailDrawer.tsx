import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';

import {
    ConfirmActionModal,
    type ConfirmActionPayload,
} from './ConfirmActionModal';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import { useAdminUserDetail } from '../hooks/useAdminUserDetail';
import { ModerationService } from '../services/ModerationService';
import type {
    AdminAssignableRole,
    AdminUserAction,
    AdminUserDetail,
    AdminWalletBalance,
} from '../types';
import {
    ActionCard,
    AdminActionBanner,
    AdminBadge,
    AdminButton,
    AdminSectionHeader,
    AdminStatusChip,
    AdminTextInput,
    ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens, type AdminTone } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type DrawerTab = 'overview' | 'moderation' | 'wallet' | 'reports' | 'sessions';

type UserDetailDrawerProps = {
    visible: boolean;
    userId: string | null;
    fallbackUsername?: string;
    onClose: () => void;
};

type PendingAction = {
    kind: AdminUserAction | 'role-change' | 'wallet-adjust';
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    tone: Exclude<AdminTone, 'neutral'>;
    successMessage: string;
    errorMessage: string;
    requireTypeToConfirmText?: string;
    requireSecondApproval?: boolean;
    secondApprovalLabel?: string;
    secondApprovalDescription?: string;
};

type TabDefinition = {
    key: DrawerTab;
    label: string;
};

const TABS: TabDefinition[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'moderation', label: 'Moderation' },
    { key: 'wallet', label: 'Wallet' },
    { key: 'reports', label: 'Reports' },
    { key: 'sessions', label: 'Sessions' },
];

const TIMEOUT_OPTIONS = [
    { label: '15m', valueMs: 15 * 60 * 1000 },
    { label: '1h', valueMs: 60 * 60 * 1000 },
    { label: '24h', valueMs: 24 * 60 * 60 * 1000 },
];

function formatTimestamp(value?: string | null): string {
    if (!value) {
        return 'Not available';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return 'Not available';
    }

    return parsed.toLocaleString();
}

function formatSignedAmount(value: number): string {
    if (value > 0) {
        return `+${value}`;
    }

    return `${value}`;
}

function parseSignedInteger(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) {
        return 0;
    }

    if (!/^-?\d+$/.test(trimmed)) {
        return Number.NaN;
    }

    return Number.parseInt(trimmed, 10);
}

function getStatusTone(status?: string): AdminTone {
    const normalized = status?.trim().toLowerCase();
    if (normalized === 'live' || normalized === 'online') {
        return 'success';
    }
    if (normalized === 'busy' || normalized === 'idle') {
        return 'warning';
    }
    if (normalized === 'banned') {
        return 'danger';
    }
    return 'neutral';
}

function formatWalletDeltaSummary(delta: AdminWalletBalance): string {
    return `Gems ${formatSignedAmount(delta.gems)}, Cash ${formatSignedAmount(delta.cash)}, Fuel ${formatSignedAmount(delta.fuel)}`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={styles.summaryValue}>{value}</Text>
        </View>
    );
}

function EmptyListState({ copy }: { copy: string }) {
    return <Text style={styles.emptyText}>{copy}</Text>;
}

function getLatestActionFeedback(
    detail: AdminUserDetail | null,
    actions: Record<string, { status: string; message?: string }>
) {
    if (!detail) {
        return null;
    }

    const keys = [
        `ban-${detail.user.id}`,
        `mute-${detail.user.id}`,
        `timeout-${detail.user.id}`,
        `shadowban-${detail.user.id}`,
        `role-${detail.user.id}`,
        `wallet-${detail.user.id}`,
    ];

    for (let index = keys.length - 1; index >= 0; index -= 1) {
        const entry = actions[keys[index]];
        if (entry?.message) {
            return {
                message: entry.message,
                tone:
                    entry.status === 'error'
                        ? ('danger' as const)
                        : entry.status === 'success'
                            ? ('success' as const)
                            : ('warning' as const),
            };
        }
    }

    return null;
}

export function UserDetailDrawer({
    visible,
    userId,
    fallbackUsername,
    onClose,
}: UserDetailDrawerProps) {
    const { width } = useWindowDimensions();
    const { canPerform } = useAdminAuth();
    const { get, post } = useAdminBackend();
    const { actions, runAction } = useAdminActionState();
    const { detail, error, loading, refetch } = useAdminUserDetail({
        enabled: visible,
        userId,
    });
    const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
    const [timeoutDurationMs, setTimeoutDurationMs] = useState<number>(TIMEOUT_OPTIONS[1].valueMs);
    const [nextRole, setNextRole] = useState<AdminAssignableRole>('user');
    const [walletGemsDelta, setWalletGemsDelta] = useState('');
    const [walletCashDelta, setWalletCashDelta] = useState('');
    const [walletFuelDelta, setWalletFuelDelta] = useState('');
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    useEffect(() => {
        if (!visible) {
            setPendingAction(null);
            setActiveTab('overview');
        }
    }, [visible]);

    useEffect(() => {
        setActiveTab('overview');
        setPendingAction(null);
    }, [userId]);

    useEffect(() => {
        const incomingRole = detail?.user.role?.trim().toLowerCase() as AdminAssignableRole | undefined;
        if (
            incomingRole === 'user' ||
            incomingRole === 'support' ||
            incomingRole === 'moderator' ||
            incomingRole === 'admin' ||
            incomingRole === 'owner'
        ) {
            setNextRole(incomingRole);
        }
    }, [detail?.user.role]);

    const parsedWalletDelta: AdminWalletBalance = {
        gems: parseSignedInteger(walletGemsDelta),
        cash: parseSignedInteger(walletCashDelta),
        fuel: parseSignedInteger(walletFuelDelta),
    };
    const hasWalletParseError =
        Number.isNaN(parsedWalletDelta.gems) ||
        Number.isNaN(parsedWalletDelta.cash) ||
        Number.isNaN(parsedWalletDelta.fuel);
    const hasWalletDelta =
        (!Number.isNaN(parsedWalletDelta.gems) && parsedWalletDelta.gems !== 0) ||
        (!Number.isNaN(parsedWalletDelta.cash) && parsedWalletDelta.cash !== 0) ||
        (!Number.isNaN(parsedWalletDelta.fuel) && parsedWalletDelta.fuel !== 0);
    const isWideLayout = width >= 920;
    const displayName =
        detail?.user.name || detail?.user.username || fallbackUsername || userId || 'User';
    const latestActionFeedback = getLatestActionFeedback(detail, actions);
    const confirmLoading = pendingAction ? actions[pendingAction.key]?.status === 'loading' : false;
    const canBanUsers = canPerform('BAN_USER');
    const canMuteUsers = canPerform('MUTE_USER');
    const canChangeUserRole = canPerform('CHANGE_USER_ROLE');
    const canEditWallet = canPerform('EDIT_WALLET');

    if (!visible) {
        return null;
    }

    async function handleConfirmAction({ reason }: ConfirmActionPayload) {
        if (!detail || !pendingAction) {
            return;
        }

        const success = await runAction(
            pendingAction.key,
            async () => {
                if (
                    pendingAction.kind === 'ban' ||
                    pendingAction.kind === 'mute' ||
                    pendingAction.kind === 'timeout' ||
                    pendingAction.kind === 'shadowban'
                ) {
                    await ModerationService.moderateUser(
                        {
                            action: pendingAction.kind,
                            reason,
                            userId: detail.user.id,
                            durationMs:
                                pendingAction.kind === 'timeout' ? timeoutDurationMs : undefined,
                        },
                        { get, post }
                    );
                    return;
                }

                if (pendingAction.kind === 'role-change') {
                    await ModerationService.updateUserRole(
                        {
                            reason,
                            role: nextRole,
                            userId: detail.user.id,
                        },
                        { get, post }
                    );
                    return;
                }

                await ModerationService.adjustWallet(
                    {
                        reason,
                        userId: detail.user.id,
                        delta: parsedWalletDelta,
                    },
                    { get, post }
                );
            },
            {
                successMessage: pendingAction.successMessage,
                errorMessage: pendingAction.errorMessage,
            }
        );

        if (!success) {
            return;
        }

        if (pendingAction.kind === 'wallet-adjust') {
            setWalletGemsDelta('');
            setWalletCashDelta('');
            setWalletFuelDelta('');
        }

        setPendingAction(null);
        await refetch();
    }

    function queueUserAction(action: AdminUserAction) {
        if (!detail) {
            return;
        }

        const descriptions: Record<AdminUserAction, { body: string; label: string }> = {
            ban: {
                body: `This will lock ${displayName} and mark the account as banned.`,
                label: 'Apply ban',
            },
            mute: {
                body: `This will mute ${displayName} across moderated communication surfaces.`,
                label: 'Apply mute',
            },
            timeout: {
                body: `This will restrict ${displayName} for ${Math.round(
                    timeoutDurationMs / 60000
                )} minutes.`,
                label: 'Apply timeout',
            },
            shadowban: {
                body: `This will silently reduce ${displayName}'s visibility without notifying them.`,
                label: 'Apply shadowban',
            },
        };

        setPendingAction({
            kind: action,
            key: `${action}-${detail.user.id}`,
            title: `Confirm ${action}`,
            description: descriptions[action].body,
            confirmLabel: descriptions[action].label,
            tone: action === 'ban' || action === 'shadowban' ? 'danger' : 'warning',
            successMessage: `${displayName} updated: ${action}.`,
            errorMessage: `Failed to apply ${action}.`,
            requireTypeToConfirmText:
                action === 'ban' || action === 'shadowban' ? 'CONFIRM' : undefined,
        });
    }

    function queueRoleChange() {
        if (!detail) {
            return;
        }

        setPendingAction({
            kind: 'role-change',
            key: `role-${detail.user.id}`,
            title: 'Confirm role change',
            description: `This will change ${displayName}'s role from ${detail.user.role.toUpperCase()} to ${nextRole.toUpperCase()}.`,
            confirmLabel: 'Change role',
            tone: 'warning',
            successMessage: `${displayName}'s role is now ${nextRole.toUpperCase()}.`,
            errorMessage: 'Failed to update role.',
        });
    }

    function queueWalletAdjust() {
        if (!detail || hasWalletParseError || !hasWalletDelta) {
            return;
        }

        const requiresRiskAcknowledgement = Object.values(parsedWalletDelta).some(
            (value) => value < 0
        );

        setPendingAction({
            kind: 'wallet-adjust',
            key: `wallet-${detail.user.id}`,
            title: 'Confirm wallet adjustment',
            description: `This will apply ${formatWalletDeltaSummary(parsedWalletDelta)} for ${displayName}.`,
            confirmLabel: requiresRiskAcknowledgement ? 'Confirm wallet debit' : 'Apply wallet update',
            tone: requiresRiskAcknowledgement ? 'warning' : 'primary',
            successMessage: `${displayName}'s wallet has been updated.`,
            errorMessage: 'Failed to update wallet.',
            requireTypeToConfirmText: requiresRiskAcknowledgement ? 'CONFIRM' : undefined,
            requireSecondApproval: requiresRiskAcknowledgement,
            secondApprovalLabel: 'Secondary approval recorded',
            secondApprovalDescription:
                'This future-ready flag marks that a second approver reviewed the wallet debit.',
        });
    }

    function renderOverview(detailValue: AdminUserDetail) {
        const flags = detailValue.user.moderationFlags;
        return (
            <ReadOnlyCard
                title="Account snapshot"
                subtitle="Current identity, status, and moderation state."
            >
                <View style={styles.rowGroup}>
                    <SummaryRow label="Name" value={detailValue.user.name} />
                    <SummaryRow label="User ID" value={detailValue.user.id} />
                    <SummaryRow
                        label="Email"
                        value={
                            detailValue.permissions.canViewEmail
                                ? detailValue.user.email || 'No email on record'
                                : 'Hidden by policy'
                        }
                    />
                    <SummaryRow label="Role" value={detailValue.user.role.toUpperCase()} />
                    <SummaryRow label="Status" value={detailValue.user.status.toUpperCase()} />
                    <SummaryRow
                        label="Account state"
                        value={detailValue.user.accountStatus.toUpperCase()}
                    />
                    <SummaryRow
                        label="Joined"
                        value={formatTimestamp(detailValue.user.joinDate)}
                    />
                    <SummaryRow
                        label="Last active"
                        value={formatTimestamp(detailValue.user.lastActive)}
                    />
                    <SummaryRow
                        label="Wallet"
                        value={`Gems ${detailValue.user.wallet.gems} • Cash ${detailValue.user.wallet.cash} • Fuel ${detailValue.user.wallet.fuel}`}
                    />
                </View>

                <View style={styles.flagRow}>
                    <AdminBadge
                        label={flags.isBanned ? 'Banned' : 'Not banned'}
                        tone={flags.isBanned ? 'danger' : 'neutral'}
                    />
                    <AdminBadge
                        label={flags.isMuted ? 'Muted' : 'Voice enabled'}
                        tone={flags.isMuted ? 'warning' : 'neutral'}
                    />
                    <AdminBadge
                        label={flags.isTimedOut ? 'Timed out' : 'No timeout'}
                        tone={flags.isTimedOut ? 'warning' : 'neutral'}
                    />
                    <AdminBadge
                        label={flags.isShadowbanned ? 'Shadowbanned' : 'Visible'}
                        tone={flags.isShadowbanned ? 'danger' : 'neutral'}
                    />
                </View>

                {detailValue.user.statusText ? (
                    <Text style={styles.helperText}>
                        Presence note: {detailValue.user.statusText}
                    </Text>
                ) : null}
            </ReadOnlyCard>
        );
    }

    function renderModeration(detailValue: AdminUserDetail) {
        if (detailValue.moderationHistory.length === 0) {
            return <EmptyListState copy="No audit entries are recorded for this user yet." />;
        }

        return detailValue.moderationHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                    <Text style={styles.timelineTitle}>{entry.actionType.replace(/_/g, ' ')}</Text>
                    <Text style={styles.timelineMeta}>{formatTimestamp(entry.createdAt)}</Text>
                </View>
                <Text style={styles.timelineBody}>Admin: {entry.adminUserId}</Text>
                <Text style={styles.timelineBody}>
                    Reason: {entry.reason || 'No reason recorded.'}
                </Text>
            </View>
        ));
    }

    function renderWallet(detailValue: AdminUserDetail) {
        if (detailValue.walletHistory.length === 0) {
            return (
                <EmptyListState copy="No wallet transactions have been recorded for this user yet." />
            );
        }

        return detailValue.walletHistory.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                    <Text style={styles.timelineTitle}>{formatWalletDeltaSummary(entry.delta)}</Text>
                    <Text style={styles.timelineMeta}>{formatTimestamp(entry.createdAt)}</Text>
                </View>
                <Text style={styles.timelineBody}>Admin: {entry.adminUserId}</Text>
                <Text style={styles.timelineBody}>Reason: {entry.reason || 'No reason provided.'}</Text>
                <Text style={styles.timelineBody}>
                    Before: G {entry.balanceBefore.gems} • C {entry.balanceBefore.cash} • F {entry.balanceBefore.fuel}
                </Text>
                <Text style={styles.timelineBody}>
                    After: G {entry.balanceAfter.gems} • C {entry.balanceAfter.cash} • F {entry.balanceAfter.fuel}
                </Text>
            </View>
        ));
    }

    function renderReports(detailValue: AdminUserDetail) {
        if (detailValue.reports.length === 0) {
            return <EmptyListState copy="No reports or support tickets are attached to this user." />;
        }

        return detailValue.reports.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                    <Text style={styles.timelineTitle}>{entry.category}</Text>
                    <Text style={styles.timelineMeta}>{formatTimestamp(entry.updatedAt)}</Text>
                </View>
                <View style={styles.badgeRow}>
                    <AdminStatusChip label={entry.status} tone={getStatusTone(entry.status)} />
                    <AdminBadge label={entry.priority} tone="warning" />
                    {entry.assigneeAdminId ? (
                        <AdminBadge label={`Assignee ${entry.assigneeAdminId}`} tone="neutral" />
                    ) : null}
                </View>
                <Text style={styles.timelineBody}>Created: {formatTimestamp(entry.createdAt)}</Text>
            </View>
        ));
    }

    function renderSessions(detailValue: AdminUserDetail) {
        if (detailValue.sessions.length === 0) {
            return <EmptyListState copy="No session or device data is currently available." />;
        }

        return detailValue.sessions.map((entry) => (
            <View key={entry.id} style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                    <Text style={styles.timelineTitle}>{entry.deviceLabel}</Text>
                    <Text style={styles.timelineMeta}>{formatTimestamp(entry.lastSeenAt)}</Text>
                </View>
                <View style={styles.badgeRow}>
                    <AdminStatusChip label={entry.status} tone={getStatusTone(entry.status)} />
                    {entry.isCurrent ? <AdminBadge label="Current" tone="neutral" /> : null}
                </View>
                <Text style={styles.timelineBody}>
                    IP: {entry.ip || 'No IP captured'}
                </Text>
                <Text style={styles.timelineBody}>
                    Agent: {entry.userAgent || 'No user-agent captured'}
                </Text>
            </View>
        ));
    }

    function renderTabContent(detailValue: AdminUserDetail) {
        switch (activeTab) {
            case 'overview':
                return renderOverview(detailValue);
            case 'moderation':
                return renderModeration(detailValue);
            case 'wallet':
                return renderWallet(detailValue);
            case 'reports':
                return renderReports(detailValue);
            case 'sessions':
                return renderSessions(detailValue);
            default:
                return null;
        }
    }

    return (
        <>
            <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
                    <View style={styles.drawer}>
                        <View style={styles.header}>
                            <View style={styles.headerCopy}>
                                <Text style={styles.headerTitle}>{displayName}</Text>
                                <Text style={styles.headerSubtitle}>
                                    {detail?.user.id || userId || 'Loading user'}
                                </Text>
                            </View>
                            <AdminButton label="Close" onPress={onClose} icon="close" />
                        </View>

                        {loading && !detail ? (
                            <View style={styles.loadingState}>
                                <ActivityIndicator size="large" color={adminTokens.colors.primary} />
                                <Text style={styles.loadingCopy}>Loading user detail…</Text>
                            </View>
                        ) : (
                            <ScrollView
                                style={styles.scrollView}
                                contentContainerStyle={styles.scrollContent}
                            >
                                <AdminSectionHeader
                                    title="User detail"
                                    description="Read-only context stays separate from controls, with confirmation required for every mutation."
                                />

                                {error ? (
                                    <ActionCard
                                        title="Unable to load user detail"
                                        subtitle={error}
                                        tone="danger"
                                    >
                                        <AdminButton
                                            label="Retry"
                                            onPress={() => {
                                                void refetch();
                                            }}
                                            tone="danger"
                                        />
                                    </ActionCard>
                                ) : null}

                                {detail ? (
                                    <>
                                        <View
                                            style={[
                                                styles.topGrid,
                                                isWideLayout && styles.topGridWide,
                                            ]}
                                        >
                                            <ReadOnlyCard
                                                title="Profile summary"
                                                subtitle="Identity and access context"
                                                style={styles.topCard}
                                            >
                                                <View style={styles.badgeRow}>
                                                    <AdminStatusChip
                                                        label={detail.user.status}
                                                        tone={getStatusTone(detail.user.status)}
                                                    />
                                                    <AdminBadge
                                                        label={detail.user.accountStatus}
                                                        tone={getStatusTone(detail.user.accountStatus)}
                                                    />
                                                    <AdminBadge
                                                        label={detail.user.role.toUpperCase()}
                                                        tone="primary"
                                                    />
                                                </View>
                                                <View style={styles.rowGroup}>
                                                    <SummaryRow label="Name" value={detail.user.name} />
                                                    <SummaryRow label="ID" value={detail.user.id} />
                                                    <SummaryRow
                                                        label="Email"
                                                        value={
                                                            detail.permissions.canViewEmail
                                                                ? detail.user.email ||
                                                                  'No email on record'
                                                                : 'Hidden by policy'
                                                        }
                                                    />
                                                    <SummaryRow
                                                        label="Last active"
                                                        value={formatTimestamp(detail.user.lastActive)}
                                                    />
                                                </View>
                                            </ReadOnlyCard>

                                            <ActionCard
                                                title="Action panel"
                                                subtitle="All mutations require a reason and confirmation."
                                                tone="warning"
                                                style={styles.topCard}
                                            >
                                                <View style={styles.actionGroup}>
                                                    <Text style={styles.groupLabel}>Moderation</Text>
                                                    <View style={styles.actionButtonGrid}>
                                                        <AdminButton
                                                            label="Ban"
                                                            tone="danger"
                                                            disabled={!detail.permissions.canManageUsers || !canBanUsers}
                                                            disabledReason={
                                                                !canBanUsers
                                                                    ? getPermissionLabel('BAN_USER')
                                                                    : !detail.permissions.canManageUsers
                                                                        ? getPermissionLabel('BAN_USER')
                                                                        : undefined
                                                            }
                                                            loading={
                                                                actions[`ban-${detail.user.id}`]?.status ===
                                                                'loading'
                                                            }
                                                            onPress={() => queueUserAction('ban')}
                                                        />
                                                        <AdminButton
                                                            label="Mute"
                                                            tone="warning"
                                                            disabled={!detail.permissions.canManageUsers || !canMuteUsers}
                                                            disabledReason={
                                                                !canMuteUsers
                                                                    ? getPermissionLabel('MUTE_USER')
                                                                    : !detail.permissions.canManageUsers
                                                                        ? getPermissionLabel('MUTE_USER')
                                                                        : undefined
                                                            }
                                                            loading={
                                                                actions[`mute-${detail.user.id}`]?.status ===
                                                                'loading'
                                                            }
                                                            onPress={() => queueUserAction('mute')}
                                                        />
                                                        <AdminButton
                                                            label="Timeout"
                                                            tone="warning"
                                                            disabled={!detail.permissions.canManageUsers || !canMuteUsers}
                                                            disabledReason={
                                                                !canMuteUsers
                                                                    ? getPermissionLabel('MUTE_USER')
                                                                    : !detail.permissions.canManageUsers
                                                                        ? getPermissionLabel('MUTE_USER')
                                                                        : undefined
                                                            }
                                                            loading={
                                                                actions[`timeout-${detail.user.id}`]?.status ===
                                                                'loading'
                                                            }
                                                            onPress={() => queueUserAction('timeout')}
                                                        />
                                                        <AdminButton
                                                            label="Shadowban"
                                                            tone="danger"
                                                            disabled={!detail.permissions.canManageUsers || !canBanUsers}
                                                            disabledReason={
                                                                !canBanUsers
                                                                    ? getPermissionLabel('BAN_USER')
                                                                    : !detail.permissions.canManageUsers
                                                                        ? getPermissionLabel('BAN_USER')
                                                                        : undefined
                                                            }
                                                            loading={
                                                                actions[
                                                                    `shadowban-${detail.user.id}`
                                                                ]?.status === 'loading'
                                                            }
                                                            onPress={() => queueUserAction('shadowban')}
                                                        />
                                                    </View>
                                                    <View style={styles.inlineChoiceRow}>
                                                        {TIMEOUT_OPTIONS.map((option) => (
                                                            <AdminButton
                                                                key={option.label}
                                                                label={option.label}
                                                                tone={
                                                                    timeoutDurationMs === option.valueMs
                                                                        ? 'primary'
                                                                        : 'neutral'
                                                                }
                                                                disabled={!detail.permissions.canManageUsers || !canMuteUsers}
                                                                disabledReason={
                                                                    !canMuteUsers
                                                                        ? getPermissionLabel('MUTE_USER')
                                                                        : !detail.permissions.canManageUsers
                                                                            ? getPermissionLabel('MUTE_USER')
                                                                            : undefined
                                                                }
                                                                onPress={() =>
                                                                    setTimeoutDurationMs(option.valueMs)
                                                                }
                                                            />
                                                        ))}
                                                    </View>
                                                </View>

                                                <View style={styles.actionGroup}>
                                                    <Text style={styles.groupLabel}>Role change</Text>
                                                    <View style={styles.inlineChoiceRow}>
                                                        {detail.permissions.availableRoles.length > 0 ? (
                                                            detail.permissions.availableRoles.map((role) => (
                                                                <AdminButton
                                                                    key={role}
                                                                label={role.toUpperCase()}
                                                                    tone={
                                                                        nextRole === role
                                                                            ? 'primary'
                                                                            : 'neutral'
                                                                    }
                                                                    disabled={!detail.permissions.canChangeRoles || !canChangeUserRole}
                                                                    disabledReason={
                                                                        !canChangeUserRole
                                                                            ? getPermissionLabel('CHANGE_USER_ROLE')
                                                                            : !detail.permissions.canChangeRoles
                                                                                ? getPermissionLabel('CHANGE_USER_ROLE')
                                                                                : undefined
                                                                    }
                                                                    onPress={() => setNextRole(role)}
                                                                />
                                                            ))
                                                        ) : (
                                                            <AdminBadge
                                                                label="Role changes need owner access"
                                                                tone="neutral"
                                                            />
                                                        )}
                                                    </View>
                                                    <AdminButton
                                                        label="Apply role"
                                                        tone="warning"
                                                        disabled={
                                                            !detail.permissions.canChangeRoles ||
                                                            !canChangeUserRole ||
                                                            nextRole ===
                                                                detail.user.role
                                                                    .trim()
                                                                    .toLowerCase()
                                                        }
                                                        disabledReason={
                                                            !canChangeUserRole || !detail.permissions.canChangeRoles
                                                                ? getPermissionLabel('CHANGE_USER_ROLE')
                                                                : undefined
                                                        }
                                                        loading={
                                                            actions[`role-${detail.user.id}`]?.status ===
                                                            'loading'
                                                        }
                                                        onPress={queueRoleChange}
                                                    />
                                                </View>

                                                <View style={styles.actionGroup}>
                                                    <Text style={styles.groupLabel}>Wallet adjust</Text>
                                                    <Text style={styles.helperText}>
                                                        Use signed whole numbers. Example: +100 or -25.
                                                    </Text>
                                                    <AdminTextInput
                                                        value={walletGemsDelta}
                                                        onChangeText={setWalletGemsDelta}
                                                        placeholder="Gems delta"
                                                    />
                                                    <AdminTextInput
                                                        value={walletCashDelta}
                                                        onChangeText={setWalletCashDelta}
                                                        placeholder="Cash delta"
                                                    />
                                                    <AdminTextInput
                                                        value={walletFuelDelta}
                                                        onChangeText={setWalletFuelDelta}
                                                        placeholder="Fuel delta"
                                                    />
                                                    {hasWalletParseError ? (
                                                        <AdminActionBanner
                                                            tone="danger"
                                                            message="Wallet deltas must be whole numbers."
                                                        />
                                                    ) : null}
                                                    <AdminButton
                                                        label="Apply wallet update"
                                                        tone="primary"
                                                        disabled={
                                                            !detail.permissions.canAdjustWallet ||
                                                            !canEditWallet ||
                                                            hasWalletParseError ||
                                                            !hasWalletDelta
                                                        }
                                                        disabledReason={
                                                            !canEditWallet || !detail.permissions.canAdjustWallet
                                                                ? getPermissionLabel('EDIT_WALLET')
                                                                : undefined
                                                        }
                                                        loading={
                                                            actions[`wallet-${detail.user.id}`]?.status ===
                                                            'loading'
                                                        }
                                                        onPress={queueWalletAdjust}
                                                    />
                                                </View>

                                                {latestActionFeedback ? (
                                                    <AdminActionBanner
                                                        tone={latestActionFeedback.tone}
                                                        message={latestActionFeedback.message}
                                                    />
                                                ) : null}
                                            </ActionCard>
                                        </View>

                                        <View style={styles.tabStripWrap}>
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={styles.tabStrip}
                                            >
                                                {TABS.map((tab) => {
                                                    const isActive = activeTab === tab.key;
                                                    return (
                                                        <Pressable
                                                            key={tab.key}
                                                            onPress={() => setActiveTab(tab.key)}
                                                            style={[
                                                                styles.tabButton,
                                                                isActive && styles.tabButtonActive,
                                                            ]}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.tabButtonText,
                                                                    isActive &&
                                                                        styles.tabButtonTextActive,
                                                                ]}
                                                            >
                                                                {tab.label}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>

                                        <View style={styles.tabContent}>{renderTabContent(detail)}</View>
                                    </>
                                ) : null}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <ConfirmActionModal
                visible={!!pendingAction}
                title={pendingAction?.title ?? 'Confirm action'}
                description={pendingAction?.description ?? ''}
                confirmLabel={pendingAction?.confirmLabel ?? 'Confirm'}
                tone={pendingAction?.tone ?? 'warning'}
                requireReason
                requireTypeToConfirmText={pendingAction?.requireTypeToConfirmText}
                requireSecondApproval={pendingAction?.requireSecondApproval}
                secondApprovalLabel={pendingAction?.secondApprovalLabel}
                secondApprovalDescription={pendingAction?.secondApprovalDescription}
                loading={confirmLoading}
                onCancel={() => setPendingAction(null)}
                onConfirm={handleConfirmAction}
            />
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'flex-end',
    },
    drawer: {
        maxHeight: '92%',
        backgroundColor: adminTokens.colors.surface,
        borderTopLeftRadius: adminTokens.radius.card,
        borderTopRightRadius: adminTokens.radius.card,
        borderWidth: adminTokens.border.width,
        borderColor: adminTokens.colors.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: adminTokens.spacing.gapMd,
        paddingHorizontal: adminTokens.spacing.pageX,
        paddingTop: adminTokens.spacing.pageX,
        paddingBottom: adminTokens.spacing.gapMd,
        borderBottomWidth: adminTokens.border.width,
        borderBottomColor: adminTokens.colors.border,
    },
    headerCopy: {
        flex: 1,
        gap: adminTokens.spacing.gapSm,
    },
    headerTitle: {
        ...adminTokens.typography.pageTitle,
        color: adminTokens.colors.textPrimary,
    },
    headerSubtitle: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: adminTokens.spacing.pageX,
        paddingBottom: 140,
        gap: adminTokens.spacing.gapMd,
    },
    loadingState: {
        paddingVertical: adminTokens.spacing.section,
        paddingHorizontal: adminTokens.spacing.pageX,
        alignItems: 'center',
        gap: adminTokens.spacing.gapSm,
    },
    loadingCopy: {
        ...adminTokens.typography.body,
        color: adminTokens.colors.textSecondary,
    },
    topGrid: {
        gap: adminTokens.spacing.gapMd,
    },
    topGridWide: {
        flexDirection: 'row',
    },
    topCard: {
        flex: 1,
    },
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: adminTokens.spacing.gapSm,
    },
    rowGroup: {
        gap: adminTokens.spacing.gapSm,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: adminTokens.spacing.gapSm,
    },
    summaryLabel: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
        flex: 1,
    },
    summaryValue: {
        ...adminTokens.typography.body,
        color: adminTokens.colors.textPrimary,
        flex: 1.4,
        textAlign: 'right',
    },
    actionGroup: {
        gap: adminTokens.spacing.gapSm,
    },
    groupLabel: {
        ...adminTokens.typography.sectionTitle,
        color: adminTokens.colors.textPrimary,
    },
    helperText: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
    },
    actionButtonGrid: {
        gap: adminTokens.spacing.gapSm,
    },
    inlineChoiceRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: adminTokens.spacing.gapSm,
    },
    flagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: adminTokens.spacing.gapSm,
        marginTop: adminTokens.spacing.gapSm,
    },
    tabStripWrap: {
        borderTopWidth: adminTokens.border.width,
        borderBottomWidth: adminTokens.border.width,
        borderColor: adminTokens.colors.border,
        paddingVertical: adminTokens.spacing.gapSm,
    },
    tabStrip: {
        gap: adminTokens.spacing.gapSm,
        paddingRight: adminTokens.spacing.pageX,
    },
    tabButton: {
        borderWidth: adminTokens.border.width,
        borderColor: adminTokens.colors.border,
        backgroundColor: adminTokens.colors.surfaceAlt,
        borderRadius: adminTokens.radius.chip,
        paddingHorizontal: adminTokens.spacing.gapMd,
        paddingVertical: adminTokens.spacing.gapSm,
    },
    tabButtonActive: {
        borderColor: adminTokens.colors.primary,
        backgroundColor: adminTokens.colors.primarySubtle,
    },
    tabButtonText: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
    },
    tabButtonTextActive: {
        color: adminTokens.colors.textPrimary,
        fontWeight: '700',
    },
    tabContent: {
        gap: adminTokens.spacing.gapMd,
    },
    timelineCard: {
        borderWidth: adminTokens.border.width,
        borderColor: adminTokens.colors.border,
        borderRadius: adminTokens.radius.card,
        backgroundColor: adminTokens.colors.surfaceAlt,
        padding: adminTokens.spacing.gapMd,
        gap: adminTokens.spacing.gapSm,
    },
    timelineHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: adminTokens.spacing.gapSm,
    },
    timelineTitle: {
        ...adminTokens.typography.sectionTitle,
        color: adminTokens.colors.textPrimary,
        flex: 1,
    },
    timelineMeta: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
        textAlign: 'right',
    },
    timelineBody: {
        ...adminTokens.typography.body,
        color: adminTokens.colors.textSecondary,
    },
    emptyText: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textMuted,
        fontStyle: 'italic',
        paddingVertical: adminTokens.spacing.gapSm,
    },
});
