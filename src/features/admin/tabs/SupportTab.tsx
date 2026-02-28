import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AdminEmptyState } from '../components/AdminEmptyState';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import { useAdminSupportTickets } from '../hooks/useAdminSupportTickets';
import {
  getTicketDisplayCode,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from '../models/support-ticket';
import {
  bulkAssignSupportTickets,
  bulkResolveSupportTickets,
  updateSupportTicketStatus,
} from '../services/support-tickets';
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
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

const STATUS_OPTIONS: Array<{ label: string; value: TicketStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  ...SUPPORT_TICKET_STATUSES.map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  })),
];

const PRIORITY_OPTIONS: Array<{ label: string; value: TicketPriority | 'all' }> = [
  { label: 'All', value: 'all' },
  ...SUPPORT_TICKET_PRIORITIES.map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  })),
];

function getStatusTone(status: TicketStatus) {
  switch (status) {
    case 'resolved':
      return 'success' as const;
    case 'closed':
      return 'neutral' as const;
    case 'investigating':
      return 'primary' as const;
    default:
      return 'warning' as const;
  }
}

function getPriorityTone(priority: TicketPriority) {
  switch (priority) {
    case 'urgent':
      return 'danger' as const;
    case 'high':
      return 'warning' as const;
    case 'low':
      return 'neutral' as const;
    default:
      return 'primary' as const;
  }
}

function filterTickets(
  tickets: SupportTicket[],
  statusFilter: TicketStatus | 'all',
  priorityFilter: TicketPriority | 'all',
  assigneeFilter: string,
) {
  const normalizedAssigneeFilter = assigneeFilter.trim().toLowerCase();

  return tickets.filter((ticket) => {
    if (statusFilter !== 'all' && ticket.status !== statusFilter) {
      return false;
    }

    if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) {
      return false;
    }

    if (
      normalizedAssigneeFilter &&
      !(ticket.assigneeAdminId ?? '').toLowerCase().includes(normalizedAssigneeFilter)
    ) {
      return false;
    }

    return true;
  });
}

export function SupportTab() {
  const router = useRouter();
  const { post } = useAdminBackend();
  const { canPerform } = useAdminAuth();
  const { actions, runAction } = useAdminActionState();
  const { tickets, loading, error, refetch } = useAdminSupportTickets();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkAssigneeAdminId, setBulkAssigneeAdminId] = useState('');

  const canResolveTicket = canPerform('RESOLVE_TICKET');
  const canBulkResolve = canPerform('BULK_RESOLVE_TICKETS');
  const canBulkAssign = canPerform('BULK_ASSIGN_TICKETS');

  const filteredTickets = useMemo(
    () => filterTickets(tickets, statusFilter, priorityFilter, assigneeFilter),
    [assigneeFilter, priorityFilter, statusFilter, tickets],
  );

  const selectedVisibleCount = selectedIds.filter((ticketId) =>
    filteredTickets.some((ticket) => ticket.id === ticketId),
  ).length;

  const toggleSelected = (ticketId: string) => {
    setSelectedIds((currentValue) =>
      currentValue.includes(ticketId)
        ? currentValue.filter((value) => value !== ticketId)
        : [...currentValue, ticketId],
    );
  };

  const handleQuickResolve = async (ticketId: string) => {
    if (!canResolveTicket) {
      return;
    }

    const actionKey = `resolve-${ticketId}`;
    const succeeded = await runAction(
      actionKey,
      async () => {
        await updateSupportTicketStatus(post, ticketId, 'resolved', 'Resolved from list view');
      },
      {
        successMessage: `${getTicketDisplayCode(ticketId)} resolved.`,
        errorMessage: `Could not resolve ${getTicketDisplayCode(ticketId)}.`,
      },
    );

    if (succeeded) {
      await refetch();
      setSelectedIds((currentValue) => currentValue.filter((value) => value !== ticketId));
    }
  };

  const handleBulkResolve = async () => {
    const ticketIds = selectedIds.filter((ticketId) => tickets.some((ticket) => ticket.id === ticketId));
    const normalizedReason = bulkReason.trim();

    if (!canBulkResolve || ticketIds.length === 0 || !normalizedReason) {
      return;
    }

    const succeeded = await runAction(
      'bulk-resolve-tickets',
      async () => {
        await bulkResolveSupportTickets(post, ticketIds, normalizedReason);
      },
      {
        successMessage: `Resolved ${ticketIds.length} selected ticket${ticketIds.length === 1 ? '' : 's'}.`,
        errorMessage: 'Could not resolve selected tickets.',
      },
    );

    if (succeeded) {
      setBulkReason('');
      setSelectedIds([]);
      await refetch();
    }
  };

  const handleBulkAssign = async () => {
    const ticketIds = selectedIds.filter((ticketId) => tickets.some((ticket) => ticket.id === ticketId));

    if (!canBulkAssign || ticketIds.length === 0) {
      return;
    }

    const assigneeAdminId = bulkAssigneeAdminId.trim() || null;

    const succeeded = await runAction(
      'bulk-assign-tickets',
      async () => {
        await bulkAssignSupportTickets(post, ticketIds, assigneeAdminId);
      },
      {
        successMessage: assigneeAdminId
          ? `Assigned ${ticketIds.length} selected ticket${ticketIds.length === 1 ? '' : 's'} to ${assigneeAdminId}.`
          : `Cleared assignee for ${ticketIds.length} selected ticket${ticketIds.length === 1 ? '' : 's'}.`,
        errorMessage: 'Could not update assignees for the selected tickets.',
      },
    );

    if (succeeded) {
      setSelectedIds([]);
      await refetch();
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title="Support inbox"
        description="Filter tickets, route owners, and batch triage the selected queue."
      />

      <ActionCard title="Filters" subtitle="Narrow the list by workflow status, urgency, or assignee.">
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
            {STATUS_OPTIONS.map((option) => {
              const isActive = statusFilter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setStatusFilter(option.value)}
                  style={[styles.optionChip, isActive && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
            {PRIORITY_OPTIONS.map((option) => {
              const isActive = priorityFilter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPriorityFilter(option.value)}
                  style={[styles.optionChip, isActive && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Assignee</Text>
          <AdminTextInput
            value={assigneeFilter}
            onChangeText={setAssigneeFilter}
            placeholder="Filter by assignee admin id"
          />
        </View>
      </ActionCard>

      <ActionCard
        title="Bulk actions"
        subtitle={
          selectedVisibleCount > 0
            ? `${selectedVisibleCount} selected in the current filtered view.`
            : 'Select one or more tickets to bulk resolve or bulk assign.'
        }
      >
        <AdminTextInput
          value={bulkAssigneeAdminId}
          onChangeText={setBulkAssigneeAdminId}
          placeholder="Admin id for bulk assign (leave blank to clear)"
        />
        <AdminTextInput
          value={bulkReason}
          onChangeText={setBulkReason}
          placeholder="Reason for bulk resolve"
          multiline
        />

        <View style={styles.bulkActionRow}>
          <AdminButton
            label="Bulk assign"
            onPress={() => {
              void handleBulkAssign();
            }}
            tone="primary"
            disabled={!canBulkAssign || selectedIds.length === 0}
            disabledReason={!canBulkAssign ? getPermissionLabel('BULK_ASSIGN_TICKETS') : undefined}
            loading={actions['bulk-assign-tickets']?.status === 'loading'}
          />
          <AdminButton
            label="Bulk resolve"
            onPress={() => {
              void handleBulkResolve();
            }}
            tone="success"
            disabled={!canBulkResolve || selectedIds.length === 0 || !bulkReason.trim()}
            disabledReason={!canBulkResolve ? getPermissionLabel('BULK_RESOLVE_TICKETS') : undefined}
            loading={actions['bulk-resolve-tickets']?.status === 'loading'}
          />
        </View>

        {actions['bulk-assign-tickets']?.message ? (
          <AdminActionBanner
            tone={
              actions['bulk-assign-tickets']?.status === 'error'
                ? 'danger'
                : actions['bulk-assign-tickets']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['bulk-assign-tickets']?.message || ''}
          />
        ) : null}

        {actions['bulk-resolve-tickets']?.message ? (
          <AdminActionBanner
            tone={
              actions['bulk-resolve-tickets']?.status === 'error'
                ? 'danger'
                : actions['bulk-resolve-tickets']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['bulk-resolve-tickets']?.message || ''}
          />
        ) : null}
      </ActionCard>

      {loading ? (
        <ReadOnlyCard
          title="Loading support tickets"
          subtitle="Fetching the current support queue from the backend."
        />
      ) : error ? (
        <AdminEmptyState
          icon="cloud-offline-outline"
          title={error}
          description="Connect the admin backend to load support tickets and perform updates."
          actions={[
            {
              label: 'Retry',
              onPress: () => {
                void refetch();
              },
            },
          ]}
        />
      ) : filteredTickets.length === 0 ? (
        <AdminEmptyState
          icon="checkmark-done-outline"
          title="No matching tickets"
          description="The current filter combination returned an empty queue."
        />
      ) : (
        filteredTickets.map((ticket) => {
          const isSelected = selectedIds.includes(ticket.id);
          const actionKey = `resolve-${ticket.id}`;

          return (
            <View key={ticket.id} style={styles.ticketBlock}>
              <ReadOnlyCard
                title={`${getTicketDisplayCode(ticket.id)} · ${ticket.category}`}
                subtitle={`Created ${new Date(ticket.createdAt).toLocaleString()}`}
                footer={
                  <View style={styles.metaRow}>
                    <AdminStatusChip label={ticket.status} tone={getStatusTone(ticket.status)} />
                    <AdminBadge label={ticket.priority} tone={getPriorityTone(ticket.priority)} />
                    <AdminBadge label={`User: ${ticket.userId}`} tone="neutral" />
                    <AdminBadge
                      label={`Assignee: ${ticket.assigneeAdminId || 'Unassigned'}`}
                      tone="neutral"
                    />
                  </View>
                }
              />

              <ActionCard
                title={isSelected ? 'Selected for bulk actions' : 'Ticket actions'}
                subtitle="Open the detail page for timeline, notes, assignment, and status changes."
                tone={isSelected ? 'warning' : 'primary'}
              >
                <View style={styles.ticketActionRow}>
                  <AdminButton
                    label={isSelected ? 'Deselect' : 'Select'}
                    onPress={() => toggleSelected(ticket.id)}
                    tone="neutral"
                  />
                  <AdminButton
                    label="Open detail"
                    onPress={() =>
                      router.push({
                        pathname: '/admin/tickets/[ticketId]' as any,
                        params: { ticketId: ticket.id },
                      })
                    }
                    tone="primary"
                  />
                  <AdminButton
                    label="Quick resolve"
                    onPress={() => {
                      void handleQuickResolve(ticket.id);
                    }}
                    tone="success"
                    disabled={!canResolveTicket || ticket.status === 'resolved' || ticket.status === 'closed'}
                    disabledReason={!canResolveTicket ? getPermissionLabel('RESOLVE_TICKET') : undefined}
                    loading={actions[actionKey]?.status === 'loading'}
                  />
                </View>

                {actions[actionKey]?.message ? (
                  <AdminActionBanner
                    tone={
                      actions[actionKey]?.status === 'error'
                        ? 'danger'
                        : actions[actionKey]?.status === 'success'
                          ? 'success'
                          : 'warning'
                    }
                    message={actions[actionKey]?.message || ''}
                  />
                ) : null}
              </ActionCard>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  filterGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  filterLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  optionRow: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapSm,
  },
  optionChip: {
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: 8,
    borderRadius: adminTokens.radius.chip,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  optionChipActive: {
    borderColor: adminTokens.colors.primaryBorder,
    backgroundColor: adminTokens.colors.primarySubtle,
  },
  optionChipText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  optionChipTextActive: {
    color: adminTokens.colors.primary,
    fontWeight: '700',
  },
  bulkActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  ticketBlock: {
    gap: adminTokens.spacing.gapSm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  ticketActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
});
