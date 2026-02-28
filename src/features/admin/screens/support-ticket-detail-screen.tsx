import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminEmptyState } from '../components/AdminEmptyState';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import { useAdminSupportTicketDetail } from '../hooks/useAdminSupportTickets';
import {
  getTicketDisplayCode,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from '../models/support-ticket';
import {
  addSupportTicketNote,
  assignSupportTicket,
  setSupportTicketPriority,
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

type SupportTicketDetailScreenProps = {
  ticketId: string;
};

type TimelineItem = {
  id: string;
  tone: 'neutral' | 'primary' | 'warning' | 'success';
  title: string;
  body: string;
  meta: string;
  createdAt: string;
};

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

function formatStatusLabel(status: TicketStatus | null) {
  if (!status) {
    return 'Unknown';
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatOptionLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildTimelineItems(
  notes: Array<{ id: string; body: string; adminId: string | null; createdAt: string }>,
  statusHistory: Array<{
    id: string;
    fromStatus: TicketStatus | null;
    toStatus: TicketStatus;
    reason: string;
    adminId: string | null;
    createdAt: string;
  }>,
): TimelineItem[] {
  const noteItems = notes.map<TimelineItem>((note) => ({
    id: `note-${note.id}`,
    tone: 'primary',
    title: 'Internal note',
    body: note.body,
    meta: `${note.adminId || 'Unknown admin'} · ${new Date(note.createdAt).toLocaleString()}`,
    createdAt: note.createdAt,
  }));

  const statusItems = statusHistory.map<TimelineItem>((entry) => ({
    id: `status-${entry.id}`,
    tone: getStatusTone(entry.toStatus),
    title: `${formatStatusLabel(entry.fromStatus)} -> ${formatStatusLabel(entry.toStatus)}`,
    body: entry.reason || 'No reason recorded.',
    meta: `${entry.adminId || 'Unknown admin'} · ${new Date(entry.createdAt).toLocaleString()}`,
    createdAt: entry.createdAt,
  }));

  return [...noteItems, ...statusItems].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function getTimelineDotStyle(tone: TimelineItem['tone']) {
  switch (tone) {
    case 'success':
      return styles.timelineDotsuccess;
    case 'warning':
      return styles.timelineDotwarning;
    case 'primary':
      return styles.timelineDotprimary;
    default:
      return styles.timelineDotneutral;
  }
}

export function SupportTicketDetailScreen({ ticketId }: SupportTicketDetailScreenProps) {
  const { post } = useAdminBackend();
  const { canPerform } = useAdminAuth();
  const { actions, runAction } = useAdminActionState();
  const { ticket, loading, error, refetch, setTicket } = useAdminSupportTicketDetail(ticketId);
  const [assigneeAdminId, setAssigneeAdminId] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [nextStatus, setNextStatus] = useState<TicketStatus>('investigating');
  const [nextPriority, setNextPriority] = useState<TicketPriority>('normal');

  const canAssign = canPerform('ASSIGN_TICKET');
  const canAddNote = canPerform('ADD_TICKET_NOTE');
  const canResolve = canPerform('RESOLVE_TICKET');
  const canSetPriority = canPerform('SET_TICKET_PRIORITY');

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setAssigneeAdminId(ticket.assigneeAdminId ?? '');
    setNextStatus(ticket.status);
    setNextPriority(ticket.priority);
  }, [ticket]);

  const timelineItems = useMemo(
    () => buildTimelineItems(ticket?.notes ?? [], ticket?.statusHistory ?? []),
    [ticket?.notes, ticket?.statusHistory],
  );

  const handleAssign = async () => {
    if (!ticket || !canAssign) {
      return;
    }

    const succeeded = await runAction(
      'assign-ticket',
      async () => {
        const nextTicket = await assignSupportTicket(post, ticket.id, assigneeAdminId.trim() || null);
        setTicket(nextTicket);
      },
      {
        successMessage: assigneeAdminId.trim()
          ? `Assigned ${getTicketDisplayCode(ticket.id)} to ${assigneeAdminId.trim()}.`
          : `Cleared assignee for ${getTicketDisplayCode(ticket.id)}.`,
        errorMessage: 'Could not update the ticket assignee.',
      },
    );

    if (succeeded) {
      await refetch();
    }
  };

  const handleAddNote = async () => {
    if (!ticket || !canAddNote || !noteDraft.trim()) {
      return;
    }

    const normalizedNote = noteDraft.trim();

    const succeeded = await runAction(
      'add-ticket-note',
      async () => {
        const nextTicket = await addSupportTicketNote(post, ticket.id, normalizedNote);
        setTicket(nextTicket);
      },
      {
        successMessage: `Added note to ${getTicketDisplayCode(ticket.id)}.`,
        errorMessage: 'Could not add the note.',
      },
    );

    if (succeeded) {
      setNoteDraft('');
      await refetch();
    }
  };

  const handleStatusChange = async () => {
    if (!ticket || !canResolve || !statusReason.trim()) {
      return;
    }

    const normalizedReason = statusReason.trim();

    const succeeded = await runAction(
      'update-ticket-status',
      async () => {
        const nextTicket = await updateSupportTicketStatus(post, ticket.id, nextStatus, normalizedReason);
        setTicket(nextTicket);
      },
      {
        successMessage: `${getTicketDisplayCode(ticket.id)} moved to ${nextStatus}.`,
        errorMessage: 'Could not update the ticket status.',
      },
    );

    if (succeeded) {
      setStatusReason('');
      await refetch();
    }
  };

  const handlePriorityChange = async () => {
    if (!ticket || !canSetPriority) {
      return;
    }

    const succeeded = await runAction(
      'update-ticket-priority',
      async () => {
        const nextTicket = await setSupportTicketPriority(post, ticket.id, nextPriority);
        setTicket(nextTicket);
      },
      {
        successMessage: `${getTicketDisplayCode(ticket.id)} priority set to ${nextPriority}.`,
        errorMessage: 'Could not update the ticket priority.',
      },
    );

    if (succeeded) {
      await refetch();
    }
  };

  if (loading && !ticket) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <ReadOnlyCard
          title="Loading ticket"
          subtitle="Fetching ticket detail, notes, assignee, and status history."
        />
      </ScrollView>
    );
  }

  if (error && !ticket) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <AdminEmptyState
          icon="alert-circle-outline"
          title={error}
          description="The ticket detail page could not load the current record."
          actions={[
            {
              label: 'Retry',
              onPress: () => {
                void refetch();
              },
            },
          ]}
        />
      </ScrollView>
    );
  }

  if (!ticket) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <AdminEmptyState
          icon="document-text-outline"
          title="Ticket not found"
          description="The requested support ticket is no longer available."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title={getTicketDisplayCode(ticket.id)}
        description={`Created ${new Date(ticket.createdAt).toLocaleString()} · Updated ${new Date(
          ticket.updatedAt,
        ).toLocaleString()}`}
      />

      <ReadOnlyCard
        title={ticket.category}
        subtitle="Ticket summary"
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
        title="Ownership"
        subtitle="Route the ticket to the admin currently responsible for follow-up."
      >
        <AdminTextInput
          value={assigneeAdminId}
          onChangeText={setAssigneeAdminId}
          placeholder="Admin id (leave blank to clear assignee)"
        />
        <AdminButton
          label="Update assignee"
          onPress={() => {
            void handleAssign();
          }}
          tone="primary"
          disabled={!canAssign}
          disabledReason={!canAssign ? getPermissionLabel('ASSIGN_TICKET') : undefined}
          loading={actions['assign-ticket']?.status === 'loading'}
        />
        {actions['assign-ticket']?.message ? (
          <AdminActionBanner
            tone={
              actions['assign-ticket']?.status === 'error'
                ? 'danger'
                : actions['assign-ticket']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['assign-ticket']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Priority"
        subtitle="Escalate or de-escalate urgency for queue ordering."
      >
        <View style={styles.optionWrap}>
          {SUPPORT_TICKET_PRIORITIES.map((priority) => {
            const isActive = nextPriority === priority;
            return (
              <Pressable
                key={priority}
                onPress={() => setNextPriority(priority)}
                style={[styles.optionChip, isActive && styles.optionChipActive]}
              >
                <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                  {formatOptionLabel(priority)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <AdminButton
          label="Save priority"
          onPress={() => {
            void handlePriorityChange();
          }}
          tone="warning"
          disabled={!canSetPriority || nextPriority === ticket.priority}
          disabledReason={!canSetPriority ? getPermissionLabel('SET_TICKET_PRIORITY') : undefined}
          loading={actions['update-ticket-priority']?.status === 'loading'}
        />
        {actions['update-ticket-priority']?.message ? (
          <AdminActionBanner
            tone={
              actions['update-ticket-priority']?.status === 'error'
                ? 'danger'
                : actions['update-ticket-priority']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['update-ticket-priority']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Status workflow"
        subtitle="Every status change requires a reason and is appended to the timeline."
      >
        <View style={styles.optionWrap}>
          {SUPPORT_TICKET_STATUSES.map((status) => {
            const isActive = nextStatus === status;
            return (
              <Pressable
                key={status}
                onPress={() => setNextStatus(status)}
                style={[styles.optionChip, isActive && styles.optionChipActive]}
              >
                <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                  {formatOptionLabel(status)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <AdminTextInput
          value={statusReason}
          onChangeText={setStatusReason}
          placeholder="Reason for the status change"
          multiline
        />
        <AdminButton
          label="Apply status"
          onPress={() => {
            void handleStatusChange();
          }}
          tone="success"
          disabled={!canResolve || nextStatus === ticket.status || !statusReason.trim()}
          disabledReason={!canResolve ? getPermissionLabel('RESOLVE_TICKET') : undefined}
          loading={actions['update-ticket-status']?.status === 'loading'}
        />
        {actions['update-ticket-status']?.message ? (
          <AdminActionBanner
            tone={
              actions['update-ticket-status']?.status === 'error'
                ? 'danger'
                : actions['update-ticket-status']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['update-ticket-status']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Internal notes"
        subtitle="Private operator notes stay attached to the ticket."
      >
        {ticket.notes.length ? (
          <View style={styles.notesWrap}>
            {ticket.notes
              .slice()
              .reverse()
              .map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <Text style={styles.noteBody}>{note.body}</Text>
                  <Text style={styles.noteMeta}>
                    {note.adminId || 'Unknown admin'} · {new Date(note.createdAt).toLocaleString()}
                  </Text>
                </View>
              ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No internal notes yet.</Text>
        )}
        <AdminTextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Add an internal note"
          multiline
        />
        <AdminButton
          label="Add note"
          onPress={() => {
            void handleAddNote();
          }}
          tone="primary"
          disabled={!canAddNote || !noteDraft.trim()}
          disabledReason={!canAddNote ? getPermissionLabel('ADD_TICKET_NOTE') : undefined}
          loading={actions['add-ticket-note']?.status === 'loading'}
        />
        {actions['add-ticket-note']?.message ? (
          <AdminActionBanner
            tone={
              actions['add-ticket-note']?.status === 'error'
                ? 'danger'
                : actions['add-ticket-note']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['add-ticket-note']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ReadOnlyCard
        title="Timeline"
        subtitle="Status transitions and internal notes in reverse chronological order."
      >
        {timelineItems.length ? (
          <View style={styles.timelineWrap}>
            {timelineItems.map((item) => (
              <View key={item.id} style={styles.timelineRow}>
                <View style={[styles.timelineDot, getTimelineDotStyle(item.tone)]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>{item.title}</Text>
                  <Text style={styles.timelineBody}>{item.body}</Text>
                  <Text style={styles.timelineMeta}>{item.meta}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No timeline entries yet.</Text>
        )}
      </ReadOnlyCard>
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
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  notesWrap: {
    gap: adminTokens.spacing.gapSm,
  },
  noteCard: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.borderSubtle,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surfaceAlt,
    padding: adminTokens.spacing.gapSm,
    gap: 6,
  },
  noteBody: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  noteMeta: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  timelineWrap: {
    gap: adminTokens.spacing.gapSm,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapSm,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  timelineDotneutral: {
    backgroundColor: adminTokens.colors.border,
  },
  timelineDotprimary: {
    backgroundColor: adminTokens.colors.primary,
  },
  timelineDotwarning: {
    backgroundColor: adminTokens.colors.warning,
  },
  timelineDotsuccess: {
    backgroundColor: adminTokens.colors.success,
  },
  timelineContent: {
    flex: 1,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.borderSubtle,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surfaceAlt,
    padding: adminTokens.spacing.gapSm,
    gap: 4,
  },
  timelineTitle: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  timelineBody: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  timelineMeta: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  emptyText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
    fontStyle: 'italic',
  },
});
