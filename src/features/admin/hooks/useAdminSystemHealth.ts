import { useCallback, useEffect, useState } from 'react';

import { useAdminBackend } from './useAdminBackend';

export interface AdminSystemHealthSnapshot {
  checkedAt: string;
  apiStatus: string;
  dbLatencyMs: number | null;
  queueSize: number | null;
  activeSessions: number | null;
  errorRate: number | null;
  errorWindowMs: number;
  sampledRequests: number;
  sampledErrors: number;
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load system health.';
}

export function useAdminSystemHealth(refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS) {
  const { get } = useAdminBackend();
  const [snapshot, setSnapshot] = useState<AdminSystemHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await get<AdminSystemHealthSnapshot>(
        '/api/admin/system-health',
      );
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (nextError) {
      setSnapshot(null);
      setError(readErrorMessage(nextError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    void refetch();

    if (refreshIntervalMs <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      void refetch();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [refetch, refreshIntervalMs]);

  return {
    snapshot,
    loading,
    error,
    refetch,
  };
}
