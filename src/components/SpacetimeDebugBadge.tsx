import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getSpacetimeTelemetrySnapshot,
  subscribeSpacetimeTelemetry,
  type SpacetimeTelemetrySnapshot,
} from '../lib/spacetime';

type BadgeTone = 'ok' | 'warn' | 'error';

function getTone(snapshot: SpacetimeTelemetrySnapshot): BadgeTone {
  if (snapshot.connectionState === 'error' || snapshot.subscriptionState === 'error') {
    return 'error';
  }

  if (snapshot.connectionState === 'connected' && snapshot.subscriptionState === 'active') {
    return 'ok';
  }

  return 'warn';
}

function toShortConnectionLabel(state: SpacetimeTelemetrySnapshot['connectionState']): string {
  switch (state) {
    case 'connected':
      return 'conn';
    case 'connecting':
      return 'dial';
    case 'disconnected':
      return 'down';
    case 'error':
      return 'err';
    case 'idle':
    default:
      return 'idle';
  }
}

function toShortSubscriptionLabel(state: SpacetimeTelemetrySnapshot['subscriptionState']): string {
  switch (state) {
    case 'active':
      return 'sub';
    case 'subscribing':
      return 'sync';
    case 'error':
      return 'err';
    case 'idle':
    default:
      return 'idle';
  }
}

function getFreshnessText(updatedAt: number): string {
  const ageMs = Math.max(0, Date.now() - updatedAt);
  if (ageMs < 1_000) return 'now';
  return `${Math.floor(ageMs / 1_000)}s`;
}

function shortIdentity(identity: string | null): string {
  if (!identity) return '------';
  const compact = identity.startsWith('0x') ? identity.slice(2) : identity;
  return compact.slice(-6).padStart(6, '0');
}

export function SpacetimeDebugBadge() {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<SpacetimeTelemetrySnapshot>(() =>
    getSpacetimeTelemetrySnapshot(),
  );

  useEffect(() => subscribeSpacetimeTelemetry(setSnapshot), []);

  const tone = getTone(snapshot);
  const freshnessText = getFreshnessText(snapshot.updatedAt);
  const dataFreshnessText = snapshot.lastDataChangeAt
    ? getFreshnessText(snapshot.lastDataChangeAt)
    : 'none';
  const databaseSuffix = shortIdentity(snapshot.resolvedDatabaseIdentity);

  const containerStyle = useMemo(
    () => [styles.container, { top: Math.max(8, insets.top + 4) }],
    [insets.top],
  );

  const badgeStyle = useMemo(() => {
    if (tone === 'ok') return [styles.badge, styles.badgeOk];
    if (tone === 'error') return [styles.badge, styles.badgeError];
    return [styles.badge, styles.badgeWarn];
  }, [tone]);

  return (
    <View style={[containerStyle, styles.pointerEventsNone]}>
      <View style={badgeStyle}>
        <Text style={styles.prefix}>ST</Text>
        <Text style={styles.value}>
          {toShortConnectionLabel(snapshot.connectionState)}/{toShortSubscriptionLabel(snapshot.subscriptionState)}
        </Text>
        <Text style={styles.meta}>
          g{snapshot.coreRowCounts.globalMessages} u{snapshot.coreRowCounts.socialUsers} d{databaseSuffix}
        </Text>
        <Text style={styles.age}>r{snapshot.recoveryCount}</Text>
        <Text style={styles.age}>d{snapshot.dataChangeCount}</Text>
        <Text style={styles.age}>{freshnessText}/{dataFreshnessText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 10,
    zIndex: 9999,
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  badge: {
    minWidth: 126,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeOk: {
    backgroundColor: 'rgba(8, 88, 45, 0.95)',
    borderColor: 'rgba(52, 211, 153, 0.65)',
  },
  badgeWarn: {
    backgroundColor: 'rgba(88, 56, 8, 0.95)',
    borderColor: 'rgba(251, 191, 36, 0.65)',
  },
  badgeError: {
    backgroundColor: 'rgba(113, 31, 31, 0.95)',
    borderColor: 'rgba(248, 113, 113, 0.65)',
  },
  prefix: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  value: {
    color: '#f9fafb',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  meta: {
    color: '#d1d5db',
    fontSize: 10,
    fontWeight: '600',
  },
  age: {
    color: '#e5e7eb',
    fontSize: 10,
    fontWeight: '600',
  },
});
