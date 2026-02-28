import { useCallback, useEffect, useState } from 'react';

import { useAdminBackend } from './useAdminBackend';

export type AdminIncidentSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface AdminIncidentAlert {
  id: string;
  title: string;
  message: string;
  severity: AdminIncidentSeverity;
  kind: string;
  createdAt: string;
  createdBy: string | null;
  deliveredCount: number;
}

export interface AdminMaintenanceModeState {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminIncidentCenterSnapshot {
  checkedAt: string;
  maintenanceMode: AdminMaintenanceModeState;
  ongoingIncident: AdminIncidentAlert | null;
  recentAlerts: AdminIncidentAlert[];
  permissions: {
    canManageSystem: boolean;
    canBroadcastAlert: boolean;
  };
}

type IncidentMutationResponse = AdminIncidentCenterSnapshot & {
  ok: boolean;
  recentAlert?: AdminIncidentAlert | null;
};

export type AdminBroadcastAlertInput = {
  title: string;
  message: string;
  severity: AdminIncidentSeverity;
  markAsOngoing?: boolean;
};

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load incident center.';
}

export function useAdminIncidentCenter(refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS) {
  const { get, post } = useAdminBackend();
  const [snapshot, setSnapshot] = useState<AdminIncidentCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await get<AdminIncidentCenterSnapshot>(
        '/api/admin/incidents',
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

  const runMutation = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      try {
        const nextSnapshot = await post<IncidentMutationResponse>(path, body);
        setSnapshot(nextSnapshot);
        setError(null);
        return nextSnapshot;
      } catch (nextError) {
        setError(readErrorMessage(nextError));
        throw nextError;
      }
    },
    [post],
  );

  const toggleMaintenanceMode = useCallback(
    async (enabled: boolean, message: string) =>
      runMutation('/api/admin/incidents/maintenance-mode', {
        enabled,
        message,
      }),
    [runMutation],
  );

  const broadcastAlert = useCallback(
    async (input: AdminBroadcastAlertInput) =>
      runMutation('/api/admin/incidents/broadcast', {
        title: input.title,
        message: input.message,
        severity: input.severity,
        markAsOngoing: Boolean(input.markAsOngoing),
      }),
    [runMutation],
  );

  const resolveIncident = useCallback(
    async () => runMutation('/api/admin/incidents/resolve'),
    [runMutation],
  );

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
    toggleMaintenanceMode,
    broadcastAlert,
    resolveIncident,
  };
}
