import { useCallback, useEffect, useState } from 'react';

import { subscribeAdminReports, subscribeSpacetimeDataChanges } from '../../../lib/spacetime';
import { readAdminReportQueue, type ReportRecord } from '../../reports/reportingClient';

const DEFAULT_REFRESH_INTERVAL_MS = 10_000;

export function useAdminReports(
  enabled: boolean,
  refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
) {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setReports([]);
      setError(null);
      setLoading(false);
      return [];
    }

    try {
      const nextReports = readAdminReportQueue();
      setReports(nextReports);
      setError(null);
      setLoading(false);
      return nextReports;
    } catch (nextError) {
      setReports([]);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load reports.');
      setLoading(false);
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setReports([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const unsubscribeReports = subscribeAdminReports();
    void refetch();

    const unsubscribeChanges = subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('reports') || event.scopes.includes('moderation') || event.scopes.includes('roles')) {
        void refetch();
      }
    });

    if (refreshIntervalMs <= 0) {
      return () => {
        unsubscribeChanges();
        unsubscribeReports();
      };
    }

    const interval = setInterval(() => {
      void refetch();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
      unsubscribeChanges();
      unsubscribeReports();
    };
  }, [enabled, refetch, refreshIntervalMs]);

  return {
    reports,
    loading,
    error,
    refetch,
  };
}
