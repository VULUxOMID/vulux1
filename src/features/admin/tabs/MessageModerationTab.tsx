import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../../../auth/spacetimeSession';
import { AdminEmptyState } from '../components/AdminEmptyState';
import {
  ConfirmActionModal,
  type ConfirmActionPayload,
} from '../components/ConfirmActionModal';
import { useAdminActionState } from '../hooks/useAdminActionState';
import {
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ActionCard,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { fetchAdminJson } from '../utils/adminBackend';
import {
  type AdminRequestClient,
  type AdminModerationPermissions,
  type FlaggedState,
  type ModerationMessageRecord,
  type ModerationScope,
  ModerationService,
} from '../services/ModerationService';

function buildQueryString(params?: Record<string, unknown>) {
  if (!params) return '';

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const normalized = `${value}`.trim();
    if (!normalized) return;
    query.append(key, normalized);
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

function formatMessageTimestamp(value: number) {
  return new Date(value).toLocaleString([], {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
    >
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

type PendingModerationAction =
  | {
      kind: 'message';
      key: 'moderate-message-tombstone' | 'moderate-message-delete';
      title: string;
      description: string;
      confirmLabel: string;
      tone: 'danger';
      leaveTombstone: boolean;
      requireTypeToConfirmText?: string;
    }
  | {
      kind: 'user';
      key: 'moderate-user-mute' | 'moderate-user-timeout' | 'moderate-user-shadowban';
      title: string;
      description: string;
      confirmLabel: string;
      tone: 'warning' | 'danger';
      userAction: 'mute' | 'timeout' | 'shadowban';
      requireTypeToConfirmText?: string;
    };

export function MessageModerationTab() {
  const { getToken } = useAuth();
  const { actions, runAction } = useAdminActionState();

  const [role, setRole] = useState('');
  const [permissions, setPermissions] = useState<AdminModerationPermissions | null>(null);
  const [messages, setMessages] = useState<ModerationMessageRecord[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<ModerationMessageRecord | null>(null);
  const [keyword, setKeyword] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [scope, setScope] = useState<ModerationScope>('all');
  const [flaggedState, setFlaggedState] = useState<FlaggedState>('all');
  const [moderationReason, setModerationReason] = useState('');
  const [durationMs, setDurationMs] = useState('3600000');
  const [leaveTombstone, setLeaveTombstone] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingModerationAction | null>(null);

  const adminClient = useMemo<AdminRequestClient>(
    () => ({
      get: async function <T>(path: string, params?: Record<string, unknown>) {
        const token = await getToken();
        if (!token) {
          throw new Error('Missing auth token.');
        }

        return fetchAdminJson<T>(`${path}${buildQueryString(params)}`, token);
      },
      post: async function <T>(path: string, body?: unknown) {
        const token = await getToken();
        if (!token) {
          throw new Error('Missing auth token.');
        }

        return fetchAdminJson<T>(path, token, {
          method: 'POST',
          body: JSON.stringify(body ?? {}),
        });
      },
    }),
    [getToken],
  );

  const availableScopes = useMemo<ModerationScope[]>(
    () => (permissions?.canViewDms ? ['all', 'global', 'dm'] : ['global']),
    [permissions?.canViewDms],
  );

  const effectiveScope: ModerationScope =
    availableScopes.includes(scope) ? scope : availableScopes[0] ?? 'global';

  const loadPermissions = useCallback(async () => {
    setLoadingPermissions(true);
    setErrorMessage('');

    try {
      const response = await ModerationService.getModerationPermissions(adminClient);
      setPermissions(response.permissions);
      setRole(response.role);
      setScope((currentScope) =>
        !response.permissions.canViewDms && currentScope !== 'global' ? 'global' : currentScope,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load moderation permissions.';
      setErrorMessage(message);
    } finally {
      setLoadingPermissions(false);
    }
  }, [adminClient]);

  const loadMessages = useCallback(async () => {
    if (permissions?.canModerateGlobalChat === false) {
      setMessages([]);
      setSelectedMessage(null);
      return;
    }

    setLoadingMessages(true);
    setErrorMessage('');

    try {
      const response = await ModerationService.listModerationMessages(
        {
          scope: effectiveScope,
          keyword,
          user: userFilter,
          dateFrom,
          dateTo,
          flaggedState,
          limit: 80,
        },
        adminClient,
      );

      setPermissions(response.permissions);
      setRole(response.role);
      setMessages(response.messages);

      setSelectedMessage((previous) => {
        if (!previous) return previous;
        return (
          response.messages.find(
            (message) => message.id === previous.id && message.scope === previous.scope,
          ) ?? null
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load moderation messages.';
      setErrorMessage(message);
    } finally {
      setLoadingMessages(false);
    }
  }, [
    adminClient,
    dateFrom,
    dateTo,
    effectiveScope,
    flaggedState,
    keyword,
    permissions?.canModerateGlobalChat,
    userFilter,
  ]);

  const loadMessageDetail = useCallback(
    async (messageId: string, messageScope: ModerationScope) => {
      setLoadingDetail(true);
      setErrorMessage('');

      try {
        const response = await ModerationService.getModerationMessageDetail(
          messageId,
          messageScope,
          adminClient,
        );
        setPermissions(response.permissions);
        setRole(response.role);
        setSelectedMessage(response.message);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load message detail.';
        setErrorMessage(message);
      } finally {
        setLoadingDetail(false);
      }
    },
    [adminClient],
  );

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    if (loadingPermissions) return;
    if (!permissions?.canModerateGlobalChat) return;
    void loadMessages();
  }, [loadMessages, loadingPermissions, permissions?.canModerateGlobalChat]);

  useEffect(() => {
    setPendingAction(null);
  }, [selectedMessage?.id, selectedMessage?.scope]);

  const handleRefresh = useCallback(async () => {
    await loadMessages();
    if (selectedMessage) {
      await loadMessageDetail(selectedMessage.id, selectedMessage.scope);
    }
  }, [loadMessageDetail, loadMessages, selectedMessage]);

  const runModerationAction = useCallback(
    async (
      key: string,
      action: () => Promise<void>,
      successMessage: string,
      errorFallback: string,
    ) => {
      return runAction(key, action, {
        successMessage,
        errorMessage: errorFallback,
      });
    },
    [runAction],
  );

  const performMessageAction = useCallback(
    async (tombstone: boolean, reason: string) => {
      if (!selectedMessage) return;
      const normalizedReason = reason.trim();
      if (!normalizedReason) {
        setErrorMessage('A reason is required for moderation actions.');
        return false;
      }

      return runModerationAction(
        tombstone ? 'moderate-message-tombstone' : 'moderate-message-delete',
        async () => {
          await ModerationService.moderateMessage(
            {
              messageId: selectedMessage.id,
              scope: selectedMessage.scope,
              leaveTombstone: tombstone,
              reason: normalizedReason,
              conversationUserIds:
                selectedMessage.scope === 'dm' ? selectedMessage.conversationUserIds : undefined,
            },
            adminClient,
          );
          await loadMessages();
          if (tombstone) {
            await loadMessageDetail(selectedMessage.id, selectedMessage.scope);
          } else {
            setSelectedMessage(null);
          }
        },
        tombstone ? 'Message replaced with tombstone.' : 'Message deleted.',
        'Unable to moderate message.',
      );
    },
    [adminClient, loadMessageDetail, loadMessages, runModerationAction, selectedMessage],
  );

  const performUserAction = useCallback(
    async (action: 'mute' | 'timeout' | 'shadowban', reason: string) => {
      if (!selectedMessage) return;
      if (!selectedMessage.senderId || selectedMessage.type !== 'user') {
        setErrorMessage('User actions are only available for user-authored messages.');
        return false;
      }
      const normalizedReason = reason.trim();
      if (!normalizedReason) {
        setErrorMessage('A reason is required for moderation actions.');
        return false;
      }

      const parsedDuration = Number.parseInt(durationMs.trim(), 10);
      const shouldSendDuration = action !== 'shadowban';
      if (shouldSendDuration && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
        setErrorMessage('Duration must be a positive number of milliseconds.');
        return false;
      }

      return runModerationAction(
        `moderate-user-${action}`,
        async () => {
          await ModerationService.moderateUser(
            {
              userId: selectedMessage.senderId,
              action,
              reason: normalizedReason,
              durationMs: shouldSendDuration ? parsedDuration : undefined,
            },
            adminClient,
          );
          await loadMessages();
          await loadMessageDetail(selectedMessage.id, selectedMessage.scope);
        },
        `${action} applied to ${selectedMessage.user || selectedMessage.senderId}.`,
        'Unable to moderate user.',
      );
    },
    [
      adminClient,
      durationMs,
      loadMessageDetail,
      loadMessages,
      runModerationAction,
      selectedMessage,
    ],
  );

  const queueMessageAction = useCallback(() => {
    if (!selectedMessage) {
      return;
    }

    setErrorMessage('');

    const actorLabel = selectedMessage.user || selectedMessage.senderId || 'this sender';
    const isHardDelete = !leaveTombstone;

    setPendingAction({
      kind: 'message',
      key: leaveTombstone ? 'moderate-message-tombstone' : 'moderate-message-delete',
      title: isHardDelete ? 'Confirm hard delete' : 'Confirm tombstone delete',
      description: isHardDelete
        ? `This will permanently delete the selected message from ${actorLabel}.`
        : `This will replace the selected message from ${actorLabel} with a moderator tombstone.`,
      confirmLabel: leaveTombstone ? 'Delete with tombstone' : 'Delete message',
      tone: 'danger',
      leaveTombstone,
      requireTypeToConfirmText: isHardDelete ? 'CONFIRM' : undefined,
    });
  }, [leaveTombstone, selectedMessage]);

  const queueUserAction = useCallback(
    (action: 'mute' | 'timeout' | 'shadowban') => {
      if (!selectedMessage) {
        return;
      }

      if (!selectedMessage.senderId || selectedMessage.type !== 'user') {
        setErrorMessage('User actions are only available for user-authored messages.');
        return;
      }

      setErrorMessage('');

      const actorLabel = selectedMessage.user || selectedMessage.senderId;
      const durationLabel = Math.round(Number.parseInt(durationMs.trim(), 10) / 60000);

      setPendingAction({
        kind: 'user',
        key: `moderate-user-${action}`,
        title: `Confirm ${action}`,
        description:
          action === 'timeout'
            ? `This will restrict ${actorLabel} for approximately ${Number.isFinite(durationLabel) ? durationLabel : 0} minutes.`
            : action === 'shadowban'
              ? `This will silently reduce ${actorLabel}'s visibility without notifying them.`
              : `This will mute ${actorLabel} across moderated communication surfaces.`,
        confirmLabel:
          action === 'shadowban'
            ? 'Apply shadowban'
            : action === 'timeout'
              ? 'Apply timeout'
              : 'Apply mute',
        tone: action === 'shadowban' ? 'danger' : 'warning',
        userAction: action,
        requireTypeToConfirmText: action === 'shadowban' ? 'CONFIRM' : undefined,
      });
    },
    [durationMs, selectedMessage],
  );

  const handleConfirmPendingAction = useCallback(
    async ({ reason }: ConfirmActionPayload) => {
      if (!pendingAction) {
        return;
      }

      const success =
        pendingAction.kind === 'message'
          ? await performMessageAction(pendingAction.leaveTombstone, reason)
          : await performUserAction(pendingAction.userAction, reason);

      if (success) {
        setPendingAction(null);
        setErrorMessage('');
      }
    },
    [pendingAction, performMessageAction, performUserAction],
  );

  const confirmLoading = pendingAction
    ? actions[pendingAction.key]?.status === 'loading'
    : false;

  const performEscalation = useCallback(async () => {
    if (!selectedMessage) return;
    const reason = moderationReason.trim();
    if (!reason) {
      setErrorMessage('A reason is required for moderation actions.');
      return;
    }

    await runModerationAction(
      'moderate-escalate-report',
      async () => {
        await ModerationService.escalateReport(
          {
            reportId: selectedMessage.primaryReportId ?? undefined,
            scope: selectedMessage.scope,
            messageId: selectedMessage.id,
            reportedUserId: selectedMessage.senderId,
            contextKey: selectedMessage.contextKey,
            reason,
          },
          adminClient,
        );
        setModerationReason('');
        await loadMessages();
        await loadMessageDetail(selectedMessage.id, selectedMessage.scope);
      },
      'Report escalated to support queue.',
      'Unable to escalate report.',
    );
  }, [adminClient, loadMessageDetail, loadMessages, moderationReason, runModerationAction, selectedMessage]);

  if (loadingPermissions) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTokens.colors.info} />
      </View>
    );
  }

  if (!permissions) {
    return (
      <View style={styles.container}>
        <AdminSectionHeader
          title="Message moderation"
          description="Review global and direct message traffic with permission-aware controls."
        />
        {errorMessage ? <AdminActionBanner tone="danger" message={errorMessage} /> : null}
        <AdminEmptyState
          icon="cloud-offline-outline"
          title="Moderation data unavailable"
          description="The moderation console could not load its permission profile."
        />
      </View>
    );
  }

  if (!permissions.canModerateGlobalChat) {
    return (
      <View style={styles.container}>
        <AdminSectionHeader
          title="Message moderation"
          description="Review global and direct message traffic with permission-aware controls."
        />
        <AdminEmptyState
          icon="shield-outline"
          title="Moderation access required"
          description="This role can open the admin console but cannot access message moderation."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title="Message moderation"
        description="Search message logs, inspect context, and apply audited moderation actions."
        filters={
          <View style={styles.filterStack}>
            <AdminTextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="Keyword"
            />
            <AdminTextInput
              value={userFilter}
              onChangeText={setUserFilter}
              placeholder="User or sender id"
            />
            <View style={styles.row}>
              <View style={styles.grow}>
                <AdminTextInput
                  value={dateFrom}
                  onChangeText={setDateFrom}
                  placeholder="Date from (YYYY-MM-DD)"
                />
              </View>
              <View style={styles.grow}>
                <AdminTextInput
                  value={dateTo}
                  onChangeText={setDateTo}
                  placeholder="Date to (YYYY-MM-DD)"
                />
              </View>
            </View>

            <View style={styles.filterRow}>
              {availableScopes.map((option) => (
                <FilterChip
                  key={option}
                  label={option === 'dm' ? 'DMs' : option === 'all' ? 'All' : 'Global'}
                  active={effectiveScope === option}
                  onPress={() => setScope(option)}
                />
              ))}
            </View>

            <View style={styles.filterRow}>
              {(['all', 'flagged', 'clean'] as FlaggedState[]).map((option) => (
                <FilterChip
                  key={option}
                  label={option === 'all' ? 'All states' : option}
                  active={flaggedState === option}
                  onPress={() => setFlaggedState(option)}
                />
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.grow}>
                <AdminButton
                  label="Apply filters"
                  tone="primary"
                  loading={loadingMessages}
                  onPress={() => {
                    void loadMessages();
                  }}
                />
              </View>
              <View style={styles.grow}>
                <AdminButton
                  label="Refresh"
                  tone="neutral"
                  onPress={() => {
                    void handleRefresh();
                  }}
                />
              </View>
            </View>
          </View>
        }
      />

      <ReadOnlyCard
        title="Access profile"
        subtitle={`Current role: ${role || 'unknown'}`}
        footer={
          <View style={styles.metaRow}>
            <AdminStatusChip
              label={permissions.canViewDms ? 'VIEW_DMS enabled' : 'VIEW_DMS locked'}
              tone={permissions.canViewDms ? 'success' : 'warning'}
            />
            <AdminBadge label={`${messages.length} messages`} tone="primary" />
          </View>
        }
      />

      {errorMessage ? <AdminActionBanner tone="danger" message={errorMessage} /> : null}

      <View style={styles.messageList}>
        {loadingMessages ? (
          <View style={styles.centeredCard}>
            <ActivityIndicator size="small" color={adminTokens.colors.info} />
          </View>
        ) : messages.length === 0 ? (
          <AdminEmptyState
            icon="chatbubbles-outline"
            title="No messages matched"
            description="Adjust the filters or clear the date range to widen the search."
          />
        ) : (
          messages.map((message) => {
            const isSelected =
              selectedMessage?.id === message.id && selectedMessage?.scope === message.scope;

            return (
              <Pressable
                key={`${message.scope}:${message.id}`}
                onPress={() => {
                  setSelectedMessage(message);
                  void loadMessageDetail(message.id, message.scope);
                }}
                style={[styles.messageCardPressable, isSelected ? styles.messageCardPressableActive : null]}
              >
                <ReadOnlyCard
                  title={`@${message.user || message.senderId || 'unknown'}`}
                  subtitle={formatMessageTimestamp(message.createdAt)}
                  footer={
                    <View style={styles.metaRow}>
                      <AdminBadge label={message.scope.toUpperCase()} tone="primary" />
                      {message.isFlagged ? (
                        <AdminStatusChip label="flagged" tone="warning" />
                      ) : (
                        <AdminStatusChip label="clean" tone="neutral" />
                      )}
                      {message.primaryReportId ? (
                        <AdminBadge label="report" tone="warning" />
                      ) : null}
                    </View>
                  }
                >
                  <Text style={styles.messageText} numberOfLines={3}>
                    {message.text || 'Empty message'}
                  </Text>
                </ReadOnlyCard>
              </Pressable>
            );
          })
        )}
      </View>

      {selectedMessage ? (
        <View style={styles.detailStack}>
          <ReadOnlyCard
            title="Message detail"
            subtitle={loadingDetail ? 'Refreshing context…' : formatMessageTimestamp(selectedMessage.createdAt)}
            footer={
              <View style={styles.metaRow}>
                <AdminBadge label={selectedMessage.scope.toUpperCase()} tone="primary" />
                {selectedMessage.contextKey ? (
                  <AdminBadge label={selectedMessage.contextKey} tone="neutral" />
                ) : null}
              </View>
            }
          >
            <Text style={styles.detailText}>Sender: {selectedMessage.senderId}</Text>
            <Text style={styles.detailText}>User: {selectedMessage.user || 'unknown'}</Text>
            <Text style={styles.detailText}>Message: {selectedMessage.text || 'Empty message'}</Text>
          </ReadOnlyCard>

          <ReadOnlyCard
            title="Context preview"
            subtitle="Previous, selected, and next messages in the same thread."
          >
            <View style={styles.contextList}>
              {selectedMessage.contextPreview.length === 0 ? (
                <Text style={styles.mutedText}>No surrounding context available.</Text>
              ) : (
                selectedMessage.contextPreview.map((contextMessage) => {
                  const isTarget = contextMessage.id === selectedMessage.id;
                  return (
                    <View
                      key={contextMessage.id}
                      style={[styles.contextRow, isTarget ? styles.contextRowActive : null]}
                    >
                      <Text style={styles.contextMeta}>
                        {contextMessage.user || contextMessage.senderId} •{' '}
                        {formatMessageTimestamp(contextMessage.createdAt)}
                      </Text>
                      <Text style={styles.contextBody}>{contextMessage.text || 'Empty message'}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </ReadOnlyCard>

          <ActionCard
            title="Action setup"
            subtitle="Delete and user actions collect their required reason in the confirmation modal. The inline reason below is used for escalation."
            tone="warning"
          >
            <AdminTextInput
              value={moderationReason}
              onChangeText={setModerationReason}
              placeholder="Reason for escalation"
              multiline
            />
            <View style={styles.filterRow}>
              <FilterChip
                label="Leave tombstone"
                active={leaveTombstone}
                onPress={() => setLeaveTombstone(true)}
              />
              <FilterChip
                label="Hard delete"
                active={!leaveTombstone}
                onPress={() => setLeaveTombstone(false)}
              />
            </View>
          </ActionCard>

          <ActionCard
            title="Message actions"
            subtitle="Delete the selected message with or without a moderator tombstone."
            tone="warning"
          >
            <View style={styles.row}>
              <View style={styles.grow}>
                <AdminButton
                  label={leaveTombstone ? 'Delete (tombstone)' : 'Delete message'}
                  tone="danger"
                  loading={
                    actions[
                      leaveTombstone ? 'moderate-message-tombstone' : 'moderate-message-delete'
                    ]?.status === 'loading'
                  }
                  onPress={queueMessageAction}
                />
              </View>
            </View>
            {actions['moderate-message-tombstone']?.message ? (
              <AdminActionBanner
                tone={
                  actions['moderate-message-tombstone']?.status === 'error' ? 'danger' : 'success'
                }
                message={actions['moderate-message-tombstone']?.message || ''}
              />
            ) : null}
            {actions['moderate-message-delete']?.message ? (
              <AdminActionBanner
                tone={actions['moderate-message-delete']?.status === 'error' ? 'danger' : 'success'}
                message={actions['moderate-message-delete']?.message || ''}
              />
            ) : null}
          </ActionCard>

          <ActionCard
            title="Escalation"
            subtitle="Escalate this message into the support queue as a formal moderation report."
            tone="primary"
          >
            <AdminButton
              label="Escalate report"
              tone="primary"
              loading={actions['moderate-escalate-report']?.status === 'loading'}
              onPress={() => {
                void performEscalation();
              }}
            />
            {actions['moderate-escalate-report']?.message ? (
              <AdminActionBanner
                tone={
                  actions['moderate-escalate-report']?.status === 'error' ? 'danger' : 'success'
                }
                message={actions['moderate-escalate-report']?.message || ''}
              />
            ) : null}
          </ActionCard>

          {permissions.canManageUsers &&
          selectedMessage.senderId &&
          selectedMessage.type === 'user' ? (
            <ActionCard
              title="User actions"
              subtitle="Mute or timeout use the duration below (milliseconds). Shadowban ignores it."
              tone="danger"
            >
              <AdminTextInput
                value={durationMs}
                onChangeText={setDurationMs}
                placeholder="Duration in milliseconds"
                keyboardType="number-pad"
              />
              <View style={styles.filterRow}>
                <View style={styles.actionButton}>
                  <AdminButton
                    label="Mute user"
                    tone="warning"
                    loading={actions['moderate-user-mute']?.status === 'loading'}
                    onPress={() => queueUserAction('mute')}
                  />
                </View>
                <View style={styles.actionButton}>
                  <AdminButton
                    label="Timeout user"
                    tone="warning"
                    loading={actions['moderate-user-timeout']?.status === 'loading'}
                    onPress={() => queueUserAction('timeout')}
                  />
                </View>
                <View style={styles.actionButton}>
                  <AdminButton
                    label="Shadowban user"
                    tone="danger"
                    loading={actions['moderate-user-shadowban']?.status === 'loading'}
                    onPress={() => queueUserAction('shadowban')}
                  />
                </View>
              </View>

              {actions['moderate-user-mute']?.message ? (
                <AdminActionBanner
                  tone={actions['moderate-user-mute']?.status === 'error' ? 'danger' : 'success'}
                  message={actions['moderate-user-mute']?.message || ''}
                />
              ) : null}
              {actions['moderate-user-timeout']?.message ? (
                <AdminActionBanner
                  tone={
                    actions['moderate-user-timeout']?.status === 'error' ? 'danger' : 'success'
                  }
                  message={actions['moderate-user-timeout']?.message || ''}
                />
              ) : null}
              {actions['moderate-user-shadowban']?.message ? (
                <AdminActionBanner
                  tone={
                    actions['moderate-user-shadowban']?.status === 'error' ? 'danger' : 'success'
                  }
                  message={actions['moderate-user-shadowban']?.message || ''}
                />
              ) : null}
            </ActionCard>
          ) : null}
        </View>
      ) : null}

      <ConfirmActionModal
        visible={!!pendingAction}
        title={pendingAction?.title ?? 'Confirm action'}
        description={pendingAction?.description ?? ''}
        confirmLabel={pendingAction?.confirmLabel ?? 'Confirm'}
        tone={pendingAction?.tone ?? 'danger'}
        requireReason
        requireTypeToConfirmText={pendingAction?.requireTypeToConfirmText}
        loading={confirmLoading}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmPendingAction}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: adminTokens.spacing.gapMd,
  },
  filterStack: {
    width: '100%',
    gap: adminTokens.spacing.gapSm,
  },
  row: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapSm,
  },
  grow: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.chip,
    paddingHorizontal: adminTokens.spacing.gapSm,
    paddingVertical: 6,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  filterChipActive: {
    borderColor: adminTokens.colors.info,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
  },
  filterChipText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  filterChipTextActive: {
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  messageList: {
    gap: adminTokens.spacing.gapSm,
  },
  messageCardPressable: {
    borderRadius: adminTokens.radius.card,
  },
  messageCardPressableActive: {
    borderWidth: 1,
    borderColor: adminTokens.colors.info,
  },
  messageText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  detailStack: {
    gap: adminTokens.spacing.gapMd,
  },
  detailText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  mutedText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  contextList: {
    gap: adminTokens.spacing.gapSm,
  },
  contextRow: {
    borderWidth: 1,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
    padding: adminTokens.spacing.gapSm,
    gap: 4,
  },
  contextRowActive: {
    borderColor: adminTokens.colors.info,
  },
  contextMeta: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  contextBody: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  actionButton: {
    minWidth: 150,
  },
});
