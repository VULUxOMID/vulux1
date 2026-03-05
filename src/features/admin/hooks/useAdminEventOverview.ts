import { useCallback, useEffect, useState } from 'react';

import { spacetimeDb, subscribeSpacetimeDataChanges } from '../../../lib/spacetime';

const DEFAULT_REFRESH_INTERVAL_MS = 10_000;

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export interface AdminEventOverviewSnapshot {
  bucketTimezone: string;
  asOfIsoUtc: string;
  todayStartIsoUtc: string;
  weekStartIsoUtc: string;
  monthStartIsoUtc: string;
  activeWindowMs: number;
  activePlayersNow: number;
  totalPlayersToday: number;
  totalPlayersWeek: number;
  totalPlayersMonth: number;
  totalEntriesToday: number;
  totalEntriesWeek: number;
  totalEntriesMonth: number;
}

function readEventOverviewSnapshot(): AdminEventOverviewSnapshot | null {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(
    dbView?.eventMetricsOverview?.iter?.() ?? dbView?.event_metrics_overview?.iter?.() ?? [],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    bucketTimezone: toText(row.bucketTimezone, 'UTC'),
    asOfIsoUtc: toText(row.asOfIsoUtc),
    todayStartIsoUtc: toText(row.todayStartIsoUtc),
    weekStartIsoUtc: toText(row.weekStartIsoUtc),
    monthStartIsoUtc: toText(row.monthStartIsoUtc),
    activeWindowMs: Math.max(0, Math.floor(toFiniteNumber(row.activeWindowMs))),
    activePlayersNow: Math.max(0, Math.floor(toFiniteNumber(row.activePlayersNow))),
    totalPlayersToday: Math.max(0, Math.floor(toFiniteNumber(row.totalPlayersToday))),
    totalPlayersWeek: Math.max(0, Math.floor(toFiniteNumber(row.totalPlayersWeek))),
    totalPlayersMonth: Math.max(0, Math.floor(toFiniteNumber(row.totalPlayersMonth))),
    totalEntriesToday: Math.max(0, Math.floor(toFiniteNumber(row.totalEntriesToday))),
    totalEntriesWeek: Math.max(0, Math.floor(toFiniteNumber(row.totalEntriesWeek))),
    totalEntriesMonth: Math.max(0, Math.floor(toFiniteNumber(row.totalEntriesMonth))),
  };
}

export function useAdminEventOverview(refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS) {
  const [snapshot, setSnapshot] = useState<AdminEventOverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const nextSnapshot = readEventOverviewSnapshot();
    setSnapshot(nextSnapshot);
    setError(nextSnapshot ? null : 'Not connected');
    setLoading(false);
    return nextSnapshot;
  }, []);

  useEffect(() => {
    void refetch();

    const unsubscribe = subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('events') || event.scopes.includes('live')) {
        void refetch();
      }
    });

    if (refreshIntervalMs <= 0) {
      return () => {
        unsubscribe();
      };
    }

    const interval = setInterval(() => {
      void refetch();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refetch, refreshIntervalMs]);

  return {
    snapshot,
    loading,
    error,
    refetch,
  };
}
