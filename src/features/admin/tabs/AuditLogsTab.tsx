import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { AdminAuditLogRecord } from '../types';
import { AdminEmptyState } from '../components/AdminEmptyState';
import { useAdminBackend } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';

type AuditLogResponse = {
  ok: boolean;
  logs: AdminAuditLogRecord[];
  page: number;
  limit: number;
  hasMore: boolean;
};

type AuditLogFilters = {
  actionType: string;
  actor: string;
  dateFrom: string;
  dateTo: string;
  targetId: string;
};

const PAGE_SIZE = 20;

const EMPTY_FILTERS: AuditLogFilters = {
  actionType: '',
  actor: '',
  dateFrom: '',
  dateTo: '',
  targetId: '',
};

function formatTimestamp(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

function hasActiveFilters(filters: AuditLogFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function summarizeMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}: ${value}`;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return `${key}: ${String(value)}`;
      }

      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(' • ');
}

function getResultTone(result: AdminAuditLogRecord['result']) {
  return result === 'fail' ? 'danger' : 'success';
}

function normalizeAuditLogRecord(record: AdminAuditLogRecord): AdminAuditLogRecord {
  return {
    ...record,
    adminUserId: record.actorAdminId || record.adminUserId,
    payload: record.metadata || record.payload || {},
    createdAt: record.ts || record.createdAt,
  };
}

export function AuditLogsTab() {
  const { get } = useAdminBackend();
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [logs, setLogs] = useState<AdminAuditLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFilterCount = useMemo(
    () =>
      Object.values(appliedFilters).reduce(
        (count, value) => count + (value.trim().length > 0 ? 1 : 0),
        0,
      ),
    [appliedFilters],
  );

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError(null);

      try {
        const response = await get<AuditLogResponse>('/admin/audit_logs', {
          actionType: appliedFilters.actionType.trim() || undefined,
          actor: appliedFilters.actor.trim() || undefined,
          dateFrom: appliedFilters.dateFrom.trim() || undefined,
          dateTo: appliedFilters.dateTo.trim() || undefined,
          targetId: appliedFilters.targetId.trim() || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        });

        const nextLogs = Array.isArray(response.logs)
          ? response.logs.map(normalizeAuditLogRecord)
          : [];
        setLogs((currentLogs) => (replace ? nextLogs : [...currentLogs, ...nextLogs]));
        setPage(typeof response.page === 'number' ? response.page : nextPage);
        setHasMore(response.hasMore === true);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load audit logs.');
        if (replace) {
          setLogs([]);
          setHasMore(false);
        }
      } finally {
        if (replace) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [appliedFilters, get],
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const handleApplyFilters = () => {
    setAppliedFilters({
      actionType: filters.actionType.trim(),
      actor: filters.actor.trim(),
      dateFrom: filters.dateFrom.trim(),
      dateTo: filters.dateTo.trim(),
      targetId: filters.targetId.trim(),
    });
  };

  const handleResetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  };

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={adminTokens.colors.primary} />
          <Text style={styles.helperText}>Loading audit trail…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <AdminEmptyState
          icon="cloud-offline-outline"
          title="Audit logs unavailable"
          description={error}
          actions={[{ label: 'Retry', onPress: () => void loadPage(1, true) }]}
        />
      );
    }

    return (
      <AdminEmptyState
        icon="receipt-outline"
        title={hasActiveFilters(appliedFilters) ? 'No matching audit logs' : 'No audit logs yet'}
        description={
          hasActiveFilters(appliedFilters)
            ? 'Try broader filters or clear the current query.'
            : 'Admin activity will appear here once actions are performed.'
        }
        actions={
          hasActiveFilters(appliedFilters)
            ? [{ label: 'Clear filters', onPress: handleResetFilters }]
            : []
        }
      />
    );
  };

  return (
    <FlatList
      data={logs}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const metadataSummary = summarizeMetadata(item.metadata);

        return (
          <ReadOnlyCard
            title={item.actionType}
            subtitle={formatTimestamp(item.ts)}
            footer={
              <View style={styles.metaRow}>
                <AdminStatusChip label={item.result} tone={getResultTone(item.result)} />
                <AdminBadge label={item.actorRole} tone="primary" />
                <AdminBadge label={item.actorAdminId} tone="neutral" />
              </View>
            }
          >
            <View style={styles.detailStack}>
              <Text style={styles.detailText}>Target: {item.targetType} • {item.targetId || 'n/a'}</Text>
              <Text style={styles.detailText}>Reason: {item.reason || 'No reason provided'}</Text>
              {item.errorMessage ? (
                <Text style={[styles.detailText, styles.errorText]}>Error: {item.errorMessage}</Text>
              ) : null}
              {metadataSummary ? (
                <Text style={styles.metaText}>{metadataSummary}</Text>
              ) : null}
            </View>
          </ReadOnlyCard>
        );
      }}
      ListHeaderComponent={
        <View style={styles.headerStack}>
          <AdminSectionHeader
            title="Audit logs"
            description="Persistent history for admin requests, including failures."
            filters={
              <View style={styles.metaRow}>
                <AdminBadge
                  label={`${logs.length} loaded`}
                  tone={logs.length > 0 ? 'primary' : 'neutral'}
                />
                <AdminBadge
                  label={`${activeFilterCount} filters`}
                  tone={activeFilterCount > 0 ? 'warning' : 'neutral'}
                />
              </View>
            }
          />

          <ActionCard
            title="Filters"
            subtitle="Use exact IDs and YYYY-MM-DD dates to narrow the audit trail."
            tone="primary"
          >
            <View style={styles.inputGroup}>
              <AdminTextInput
                value={filters.actionType}
                onChangeText={(value) => setFilters((current) => ({ ...current, actionType: value }))}
                placeholder="Action type"
              />
              <AdminTextInput
                value={filters.actor}
                onChangeText={(value) => setFilters((current) => ({ ...current, actor: value }))}
                placeholder="Actor admin ID"
              />
              <AdminTextInput
                value={filters.dateFrom}
                onChangeText={(value) => setFilters((current) => ({ ...current, dateFrom: value }))}
                placeholder="Date from (YYYY-MM-DD)"
              />
              <AdminTextInput
                value={filters.dateTo}
                onChangeText={(value) => setFilters((current) => ({ ...current, dateTo: value }))}
                placeholder="Date to (YYYY-MM-DD)"
              />
              <AdminTextInput
                value={filters.targetId}
                onChangeText={(value) => setFilters((current) => ({ ...current, targetId: value }))}
                placeholder="Target ID"
              />
            </View>

            <View style={styles.buttonRow}>
              <AdminButton
                label="Apply filters"
                tone="primary"
                loading={loading}
                onPress={handleApplyFilters}
              />
              <AdminButton
                label="Reset"
                tone="neutral"
                disabled={!hasActiveFilters(filters) && !hasActiveFilters(appliedFilters)}
                onPress={handleResetFilters}
              />
            </View>
          </ActionCard>
        </View>
      }
      ListEmptyComponent={renderEmptyState()}
      ListFooterComponent={
        logs.length > 0 ? (
          <View style={styles.footerStack}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {hasMore ? (
              <AdminButton
                label="Load more"
                tone="primary"
                loading={loadingMore}
                onPress={() => void loadPage(page + 1, false)}
              />
            ) : (
              <Text style={styles.helperText}>End of audit history for the current filter set.</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  headerStack: {
    gap: adminTokens.spacing.gapMd,
  },
  inputGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  detailStack: {
    gap: 4,
  },
  detailText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textPrimary,
  },
  metaText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  helperText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.danger,
  },
  centerBox: {
    paddingVertical: adminTokens.spacing.section,
    alignItems: 'center',
    justifyContent: 'center',
    gap: adminTokens.spacing.gapSm,
  },
  footerStack: {
    gap: adminTokens.spacing.gapSm,
    alignItems: 'center',
    paddingTop: adminTokens.spacing.gapSm,
  },
});
