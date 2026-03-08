import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, PillTabs, type PillTabItem } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { PrivacyToggleCard } from './PrivacyToggleCard';
import { LeaderboardSearchBar } from './LeaderboardSearchBar';
import { LeaderboardTitle } from './LeaderboardTitle';

type LeaderboardListHeaderProps = {
  isPublic: boolean;
  onToggle: (value: boolean) => void;
  scopeValue: string;
  onScopeChange: (value: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  summary: string;
  statusLabel?: string | null;
};

const SCOPE_ITEMS: PillTabItem[] = [
  { key: 'all', label: 'All', icon: 'globe-outline' },
  { key: 'friends', label: 'Friends', icon: 'people-outline' },
  { key: 'me', label: 'Me', icon: 'person-outline' },
];

function LeaderboardListHeaderComponent({
  isPublic,
  onToggle,
  scopeValue,
  onScopeChange,
  searchValue,
  onSearchChange,
  onClearSearch,
  summary,
  statusLabel,
}: LeaderboardListHeaderProps) {
  const statusStyles = useMemo(
    () => (statusLabel ? [styles.statusCard, styles.statusCardWarning] : null),
    [statusLabel],
  );

  return (
    <View style={styles.container}>
      <LeaderboardTitle />
      <AppText variant="small" secondary style={styles.summary}>
        {summary}
      </AppText>
      <PrivacyToggleCard isPublic={isPublic} onToggle={onToggle} />
      <PillTabs
        items={SCOPE_ITEMS}
        value={scopeValue}
        onChange={onScopeChange}
        style={styles.scopeTabs}
      />
      <LeaderboardSearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        onClear={onClearSearch}
      />
      {statusLabel ? (
        <View style={statusStyles}>
          <View style={styles.statusDot} />
          <AppText variant="tinyBold" style={styles.statusText}>
            {statusLabel}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export const LeaderboardListHeader = memo(LeaderboardListHeaderComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  summary: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  scopeTabs: {
    marginBottom: spacing.md,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smPlus,
  },
  statusCardWarning: {
    backgroundColor: colors.overlayAccentDangerSubtle,
    borderColor: colors.accentDanger,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accentDanger,
  },
  statusText: {
    flex: 1,
  },
});
