import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFriendshipsRepo } from '../../../data/provider';
import { AdminChoiceFilter, AdminRangeFilter } from '../components/AdminSearchFilters';
import { AdminEmptyState } from '../components/AdminEmptyState';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useAdminUserSearch } from '../hooks/useAdminUserSearch';
import {
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens, type AdminTone } from '../ui/adminTokens';

type SelectedUser = {
  userId: string;
  username: string;
} | null;

function getStatusTone(status?: string): AdminTone {
  const normalized = status?.trim().toLowerCase();
  if (normalized === 'live' || normalized === 'online') {
    return 'success';
  }
  if (normalized === 'busy' || normalized === 'idle' || normalized === 'recent') {
    return 'warning';
  }
  return 'neutral';
}

function parseOptionalWholeNumber(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(parsed, 0);
}

function parseOptionalDecimal(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsed = Number.parseFloat(trimmedValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(parsed, 0);
}

function normalizeRange(minValue: number | null, maxValue: number | null) {
  if (minValue !== null && maxValue !== null && minValue > maxValue) {
    return {
      min: maxValue,
      max: minValue,
    };
  }

  return {
    min: minValue,
    max: maxValue,
  };
}

function formatDateLabel(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 'Unknown';
  }

  return new Date(timestamp).toLocaleString();
}

function formatMetricValue(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}

export function UsersTab() {
  const friendshipsRepo = useFriendshipsRepo();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [reportCountMin, setReportCountMin] = useState('');
  const [reportCountMax, setReportCountMax] = useState('');
  const [spendMin, setSpendMin] = useState('');
  const [spendMax, setSpendMax] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const friendIds = useMemo(() => {
    try {
      return (friendshipsRepo.listAcceptedFriendIds() || []).map((friendId) => friendId.toString());
    } catch {
      return [];
    }
  }, [friendshipsRepo]);

  const normalizedReportRange = useMemo(
    () => normalizeRange(parseOptionalWholeNumber(reportCountMin), parseOptionalWholeNumber(reportCountMax)),
    [reportCountMax, reportCountMin],
  );
  const normalizedSpendRange = useMemo(
    () => normalizeRange(parseOptionalDecimal(spendMin), parseOptionalDecimal(spendMax)),
    [spendMax, spendMin],
  );

  const searchRequest = useMemo(
    () => ({
      queryText: debouncedSearchQuery,
      accountStatus: accountStatusFilter || undefined,
      role: roleFilter.trim().toLowerCase() || undefined,
      reportCountMin: normalizedReportRange.min,
      reportCountMax: normalizedReportRange.max,
      activity: activityFilter || undefined,
      spendMin: normalizedSpendRange.min,
      spendMax: normalizedSpendRange.max,
      page: 1,
      limit: 50,
    }),
    [
      accountStatusFilter,
      activityFilter,
      debouncedSearchQuery,
      normalizedReportRange.max,
      normalizedReportRange.min,
      normalizedSpendRange.max,
      normalizedSpendRange.min,
      roleFilter,
    ],
  );

  const { users, loading, error, hasLoaded, total, spendDataAvailable, refetch } =
    useAdminUserSearch(searchRequest);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(accountStatusFilter) ||
    Boolean(roleFilter.trim()) ||
    Boolean(activityFilter) ||
    Boolean(reportCountMin.trim()) ||
    Boolean(reportCountMax.trim()) ||
    Boolean(spendMin.trim()) ||
    Boolean(spendMax.trim());

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setAccountStatusFilter('');
    setRoleFilter('');
    setActivityFilter('');
    setReportCountMin('');
    setReportCountMax('');
    setSpendMin('');
    setSpendMax('');
  };

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {error ? <AdminActionBanner tone="danger" message={error} /> : null}
      {loading && hasLoaded ? (
        <View style={styles.loadingInline}>
          <ActivityIndicator size="small" color={adminTokens.colors.primary} />
          <Text style={styles.loadingInlineText}>Refreshing search results...</Text>
        </View>
      ) : null}
      {hasLoaded ? (
        <Text style={styles.resultSummary}>
          Showing {users.length.toLocaleString()} of {total.toLocaleString()} matching users.
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <AdminSectionHeader
        title="Users"
        description="Server-backed search across username, user ID, and email. Open the admin detail drawer for profile, moderation, wallet, report, and session context."
        filters={
          <View style={styles.filterWrap}>
            <AdminTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search username, user ID, or email"
            />

            <View style={styles.searchScopeRow}>
              <AdminBadge label="username" tone="primary" />
              <AdminBadge label="user ID" tone="primary" />
              <AdminBadge label="email" tone="primary" />
            </View>
            <Text style={styles.searchHint}>
              Email search supports exact matching plus safe prefix matching.
            </Text>

            <AdminChoiceFilter
              label="Account status"
              value={accountStatusFilter}
              options={[
                { label: 'All', value: '' },
                { label: 'Active', value: 'active' },
                { label: 'Banned', value: 'banned' },
              ]}
              onChange={setAccountStatusFilter}
            />

            <View style={styles.filterRow}>
              <View style={styles.filterColumn}>
                <Text style={styles.filterLabel}>Role</Text>
                <AdminTextInput
                  value={roleFilter}
                  onChangeText={setRoleFilter}
                  placeholder="user, moderator, admin"
                />
              </View>
              <View style={styles.filterColumn}>
                <AdminChoiceFilter
                  label="Live activity"
                  value={activityFilter}
                  options={[
                    { label: 'All', value: '' },
                    { label: 'Hosting', value: 'hosting' },
                    { label: 'Watching', value: 'watching' },
                    { label: 'Idle', value: 'idle' },
                  ]}
                  onChange={setActivityFilter}
                />
              </View>
            </View>

            <AdminRangeFilter
              label="Report count"
              minValue={reportCountMin}
              maxValue={reportCountMax}
              onChangeMin={setReportCountMin}
              onChangeMax={setReportCountMax}
              helperText="Derived from support tickets linked to the user."
            />

            {spendDataAvailable ? (
              <AdminRangeFilter
                label="Spend total"
                minValue={spendMin}
                maxValue={spendMax}
                onChangeMin={setSpendMin}
                onChangeMax={setSpendMax}
                helperText="Shown when wallet spend metrics are present in account state."
              />
            ) : (
              <Text style={styles.searchHint}>
                Spend filters appear automatically when wallet spend data is available.
              </Text>
            )}

            {hasActiveFilters ? (
              <View style={styles.filterActions}>
                <AdminButton label="Clear filters" tone="neutral" onPress={clearFilters} />
              </View>
            ) : null}
          </View>
        }
      />

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onRefresh={refetch}
        refreshing={loading && hasLoaded}
        ListHeaderComponent={renderListHeader()}
        renderItem={({ item }) => {
          const itemId = item.id;
          return (
            <Pressable
              onPress={() =>
                setSelectedUser({
                  userId: itemId,
                  username: item.username || itemId,
                })
              }
            >
              <ReadOnlyCard
                title={`@${item.username || 'unknown'}`}
                subtitle={`User ID: ${itemId}`}
                footer={
                  <View style={styles.footerRow}>
                    <View style={styles.tagsRow}>
                      <AdminStatusChip
                        label={item.accountStatus || 'unknown'}
                        tone={item.accountStatus === 'banned' ? 'danger' : 'success'}
                      />
                      <AdminStatusChip
                        label={item.presenceStatus || 'offline'}
                        tone={getStatusTone(item.presenceStatus)}
                      />
                      <AdminBadge label={`role: ${item.role || 'user'}`} tone="primary" />
                      <AdminBadge
                        label={`reports: ${item.reportCount ?? 0}`}
                        tone={item.reportCount > 0 ? 'warning' : 'neutral'}
                      />
                      {item.activity ? <AdminBadge label={item.activity} tone="primary" /> : null}
                      {friendIds.includes(itemId) ? (
                        <AdminBadge label="friend" tone="primary" />
                      ) : null}
                    </View>

                    <AdminButton
                      label="Open detail"
                      tone="primary"
                      onPress={() =>
                        setSelectedUser({
                          userId: itemId,
                          username: item.username || itemId,
                        })
                      }
                    />
                  </View>
                }
              >
                <View style={styles.detailStack}>
                  <Text style={styles.detailText}>{item.email || 'No email on file'}</Text>
                  <Text style={styles.detailText}>Last active: {formatDateLabel(item.lastActive)}</Text>
                  <Text style={styles.detailText}>Joined: {formatDateLabel(item.joinDate)}</Text>
                  {item.spendTotal !== null ? (
                    <Text style={styles.detailText}>Spend total: {formatMetricValue(item.spendTotal)}</Text>
                  ) : null}
                </View>
              </ReadOnlyCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={adminTokens.colors.primary} />
              <Text style={styles.loadingText}>Loading admin search...</Text>
            </View>
          ) : hasLoaded ? (
            <AdminEmptyState
              icon="people-outline"
              title="No users matched"
              description="Search covers username, user ID, and email with status, role, report, and activity filters."
              actions={[
                ...(hasActiveFilters ? [{ label: 'Clear filters', onPress: clearFilters }] : []),
                { label: 'Retry', onPress: refetch },
              ]}
            />
          ) : null
        }
      />

      <UserDetailDrawer
        visible={!!selectedUser}
        userId={selectedUser?.userId ?? null}
        fallbackUsername={selectedUser?.username}
        onClose={() => setSelectedUser(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
  },
  filterWrap: {
    width: '100%',
    gap: adminTokens.spacing.gapMd,
  },
  listContent: {
    gap: adminTokens.spacing.gapMd,
    paddingBottom: 140,
  },
  listHeader: {
    gap: adminTokens.spacing.gapSm,
  },
  searchScopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  searchHint: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: adminTokens.spacing.gapMd,
  },
  filterColumn: {
    flex: 1,
    gap: adminTokens.spacing.gapSm,
  },
  filterLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  filterActions: {
    alignItems: 'flex-start',
  },
  resultSummary: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTokens.spacing.gapSm,
    paddingVertical: 4,
  },
  loadingInlineText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  centerBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTokens.colors.surfaceAlt,
    borderRadius: adminTokens.radius.card,
    borderWidth: 1,
    borderColor: adminTokens.colors.borderSubtle,
  },
  loadingText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
    marginTop: adminTokens.spacing.gapMd,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: adminTokens.spacing.gapMd,
  },
  tagsRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  detailStack: {
    gap: 4,
  },
  detailText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
  },
});
