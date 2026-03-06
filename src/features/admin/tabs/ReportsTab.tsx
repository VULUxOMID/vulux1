import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminEmptyState } from '../components/AdminEmptyState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminReports } from '../hooks/useAdminReports';
import {
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminPageContainer,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { reviewReport, type ReportRecord, type ReportReviewStatus } from '../../reports/reportingClient';

type FilterValue = 'all' | ReportReviewStatus;

function formatTimestamp(valueMs: number): string {
  if (!valueMs) {
    return 'Unknown';
  }

  return new Date(valueMs).toLocaleString([], {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusTone(status: ReportReviewStatus) {
  if (status === 'resolved') return 'success' as const;
  if (status === 'dismissed') return 'neutral' as const;
  if (status === 'triaged') return 'warning' as const;
  return 'danger' as const;
}

function readContextLabel(report: ReportRecord): string {
  if (report.targetType === 'live') {
    return `${(report.context.liveTitle as string | undefined)?.trim() || report.targetId}`;
  }

  if (report.targetType === 'message') {
    return `${(report.context.messageSenderUsername as string | undefined)?.trim() || report.reportedUserId || 'message'}: ${(report.context.messageExcerpt as string | undefined)?.trim() || report.targetId}`;
  }

  return `${(report.context.reportedUsername as string | undefined)?.trim() || report.targetId}`;
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

export function ReportsTab() {
  const { canPerform } = useAdminAuth();
  const canReviewReports = canPerform('VIEW_MESSAGE_LOGS');
  const { reports, loading, error, refetch } = useAdminReports(canReviewReports);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterValue>('all');
  const [reviewNotes, setReviewNotes] = useState('');
  const [pendingStatus, setPendingStatus] = useState<ReportReviewStatus | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') {
      return reports;
    }
    return reports.filter((report) => report.status === statusFilter);
  }, [reports, statusFilter]);

  const selectedReport = useMemo(() => {
    return (
      filteredReports.find((report) => report.id === selectedReportId) ??
      filteredReports[0] ??
      null
    );
  }, [filteredReports, selectedReportId]);

  const counts = useMemo(() => {
    return reports.reduce<Record<ReportReviewStatus, number>>(
      (accumulator, report) => {
        accumulator[report.status] += 1;
        return accumulator;
      },
      { open: 0, triaged: 0, resolved: 0, dismissed: 0 },
    );
  }, [reports]);

  useEffect(() => {
    if (!selectedReport) {
      setReviewNotes('');
      return;
    }

    setSelectedReportId(selectedReport.id);
    setReviewNotes(selectedReport.reviewNotes ?? '');
  }, [selectedReport]);

  if (!canReviewReports) {
    return (
      <AdminPageContainer>
        <AdminSectionHeader
          title="Reports"
          description="Review submitted user, message, and live reports."
        />
        <AdminEmptyState
          icon="shield-outline"
          title="Report review access required"
          description="This admin role cannot open the report review queue."
        />
      </AdminPageContainer>
    );
  }

  const runReview = async (status: ReportReviewStatus) => {
    if (!selectedReport) {
      return;
    }

    setPendingStatus(status);
    setBanner(null);
    try {
      await reviewReport({
        reportId: selectedReport.id,
        status,
        reviewNotes,
      });
      setBanner({ tone: 'success', message: `Report moved to ${status}.` });
      await refetch();
    } catch (nextError) {
      setBanner({
        tone: 'danger',
        message: nextError instanceof Error ? nextError.message : 'Unable to update report status.',
      });
    } finally {
      setPendingStatus(null);
    }
  };

  return (
    <AdminPageContainer>
      <AdminSectionHeader
        title="Reports"
        description="Review user, message, and live reports without raw DB access."
        filters={
          <View style={styles.filterRow}>
            <FilterChip label="All" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
            <FilterChip label="Open" active={statusFilter === 'open'} onPress={() => setStatusFilter('open')} />
            <FilterChip label="Triaged" active={statusFilter === 'triaged'} onPress={() => setStatusFilter('triaged')} />
            <FilterChip label="Resolved" active={statusFilter === 'resolved'} onPress={() => setStatusFilter('resolved')} />
            <FilterChip label="Dismissed" active={statusFilter === 'dismissed'} onPress={() => setStatusFilter('dismissed')} />
          </View>
        }
      />

      {banner ? <AdminActionBanner tone={banner.tone} message={banner.message} /> : null}
      {error ? <AdminActionBanner tone="danger" message={error} /> : null}

      <View style={styles.summaryRow}>
        <ReadOnlyCard title="Open" subtitle="Needs review">
          <Text style={styles.metricValue}>{counts.open}</Text>
        </ReadOnlyCard>
        <ReadOnlyCard title="Triaged" subtitle="In progress">
          <Text style={styles.metricValue}>{counts.triaged}</Text>
        </ReadOnlyCard>
        <ReadOnlyCard title="Resolved" subtitle="Actioned">
          <Text style={styles.metricValue}>{counts.resolved}</Text>
        </ReadOnlyCard>
        <ReadOnlyCard title="Dismissed" subtitle="Closed">
          <Text style={styles.metricValue}>{counts.dismissed}</Text>
        </ReadOnlyCard>
      </View>

      {loading && reports.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={adminTokens.colors.primary} />
          <Text style={styles.helperText}>Loading report queue…</Text>
        </View>
      ) : null}

      {!loading && filteredReports.length === 0 ? (
        <AdminEmptyState
          icon="flag-outline"
          title="No reports in this filter"
          description="Submitted reports will appear here with their current review state."
          actions={[{ label: 'Refresh', onPress: () => { void refetch(); } }]}
        />
      ) : null}

      {filteredReports.length > 0 ? (
        <View style={styles.columns}>
          <ScrollView style={styles.listColumn} contentContainerStyle={styles.listContent}>
            {filteredReports.map((report) => {
              const selected = report.id === selectedReport?.id;
              return (
                <Pressable
                  key={report.id}
                  onPress={() => setSelectedReportId(report.id)}
                  style={[styles.listItem, selected ? styles.listItemSelected : null]}
                >
                  <View style={styles.listItemHeader}>
                    <AdminBadge label={report.targetType} tone="primary" />
                    <AdminStatusChip label={report.status} tone={getStatusTone(report.status)} />
                  </View>
                  <Text style={styles.listItemTitle}>{readContextLabel(report)}</Text>
                  <Text style={styles.listItemMeta}>
                    {report.reason} • {report.surface} • {formatTimestamp(report.createdAtMs)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedReport ? (
            <View style={styles.detailColumn}>
              <ReadOnlyCard
                title={readContextLabel(selectedReport)}
                subtitle={`Reporter ${selectedReport.reporterUserId} • ${formatTimestamp(selectedReport.createdAtMs)}`}
                footer={
                  <View style={styles.detailFooter}>
                    <AdminBadge label={selectedReport.targetType} tone="primary" />
                    <AdminBadge label={selectedReport.surface} tone="neutral" />
                    {selectedReport.reportedUserId ? (
                      <AdminBadge label={`reported ${selectedReport.reportedUserId}`} tone="warning" />
                    ) : null}
                  </View>
                }
              >
                <View style={styles.detailBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reason</Text>
                    <Text style={styles.detailValue}>{selectedReport.reason}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <AdminStatusChip label={selectedReport.status} tone={getStatusTone(selectedReport.status)} />
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Details</Text>
                    <Text style={styles.detailValue}>
                      {selectedReport.details?.trim() || 'No additional reporter details.'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Context</Text>
                    <Text style={styles.contextValue}>
                      {JSON.stringify(selectedReport.context, null, 2)}
                    </Text>
                  </View>
                </View>
              </ReadOnlyCard>

              <ReadOnlyCard
                title="Review"
                subtitle="Update the report state and capture moderation notes."
              >
                <View style={styles.reviewBody}>
                  <AdminTextInput
                    value={reviewNotes}
                    onChangeText={setReviewNotes}
                    placeholder="Add internal review notes"
                    multiline
                  />
                  <View style={styles.reviewButtons}>
                    <AdminButton
                      label="Reopen"
                      tone="neutral"
                      onPress={() => {
                        void runReview('open');
                      }}
                      loading={pendingStatus === 'open'}
                    />
                    <AdminButton
                      label="Triaged"
                      tone="warning"
                      onPress={() => {
                        void runReview('triaged');
                      }}
                      loading={pendingStatus === 'triaged'}
                    />
                    <AdminButton
                      label="Resolved"
                      tone="success"
                      onPress={() => {
                        void runReview('resolved');
                      }}
                      loading={pendingStatus === 'resolved'}
                    />
                    <AdminButton
                      label="Dismiss"
                      tone="danger"
                      onPress={() => {
                        void runReview('dismissed');
                      }}
                      loading={pendingStatus === 'dismissed'}
                    />
                  </View>
                </View>
              </ReadOnlyCard>
            </View>
          ) : null}
        </View>
      ) : null}
    </AdminPageContainer>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  filterChip: {
    borderRadius: adminTokens.radius.chip,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    backgroundColor: adminTokens.colors.surfaceAlt,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  filterChipActive: {
    borderColor: adminTokens.colors.primaryBorder,
    backgroundColor: adminTokens.colors.primarySubtle,
  },
  filterChipText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  filterChipTextActive: {
    color: adminTokens.colors.primary,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapMd,
    marginVertical: adminTokens.spacing.gapMd,
  },
  metricValue: {
    ...adminTokens.typography.pageTitle,
    color: adminTokens.colors.textPrimary,
  },
  loadingState: {
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
    paddingVertical: adminTokens.spacing.section,
  },
  helperText: {
    ...adminTokens.typography.sectionDescription,
    color: adminTokens.colors.textSecondary,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: adminTokens.spacing.gapMd,
    minHeight: 0,
  },
  listColumn: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: adminTokens.spacing.gapSm,
    paddingBottom: adminTokens.spacing.section,
  },
  listItem: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.card,
    backgroundColor: adminTokens.colors.surface,
    padding: adminTokens.spacing.card,
    gap: adminTokens.spacing.gapSm,
  },
  listItemSelected: {
    borderColor: adminTokens.colors.primaryBorder,
    backgroundColor: adminTokens.colors.primarySubtle,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: adminTokens.spacing.gapSm,
  },
  listItemTitle: {
    ...adminTokens.typography.cardTitle,
    color: adminTokens.colors.textPrimary,
  },
  listItemMeta: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  detailColumn: {
    flex: 1.2,
    gap: adminTokens.spacing.gapMd,
  },
  detailFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  detailBody: {
    gap: adminTokens.spacing.gapMd,
  },
  detailRow: {
    gap: adminTokens.spacing.gapSm,
  },
  detailLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
    textTransform: 'uppercase',
  },
  detailValue: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  contextValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    color: adminTokens.colors.textSecondary,
  },
  reviewBody: {
    gap: adminTokens.spacing.gapMd,
  },
  reviewButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
});
