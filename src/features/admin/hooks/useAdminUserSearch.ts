import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../auth/spacetimeSession';
import { getBackendTokenTemplate } from '../../../config/backendToken';
import { getBackendToken } from '../../../utils/backendToken';

function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getAdminUsersUrl(searchParams: URLSearchParams) {
  const configuredBaseUrl =
    trim(process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL) ??
    trim(process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL) ??
    trim(process.env.EXPO_PUBLIC_API_URL) ??
    'http://localhost:5000/api';
  const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/, '');
  const baseWithApi = normalizedBaseUrl.endsWith('/api')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api`;
  const querySuffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return `${baseWithApi}/admin/users${querySuffix}`;
}

async function parseJsonSafely(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type AdminUserRecord = {
  id: string;
  username: string;
  email: string;
  role: string;
  accountStatus: string;
  joinDate: string;
  lastActive: string;
  presenceStatus: string;
  activity: 'hosting' | 'watching' | null;
  reportCount: number;
  spendTotal: number | null;
};

export type AdminUserSearchRequest = {
  queryText: string;
  accountStatus?: string;
  role?: string;
  reportCountMin?: number | null;
  reportCountMax?: number | null;
  activity?: string;
  spendMin?: number | null;
  spendMax?: number | null;
  page?: number;
  limit?: number;
};

export function useAdminUserSearch(request: AdminUserSearchRequest) {
  const { getToken } = useAuth();
  const tokenTemplate = useMemo(() => getBackendTokenTemplate(), []);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [spendDataAvailable, setSpendDataAvailable] = useState(false);

  const fetchUsers = useCallback(
    async (signal?: AbortSignal) => {
      const token = await getBackendToken(getToken, tokenTemplate);
      if (!token) {
        setUsers([]);
        setTotal(0);
        setError('Missing auth token for admin user search.');
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        const trimmedQueryText = request.queryText.trim();

        if (trimmedQueryText) params.set('queryText', trimmedQueryText);
        if (request.accountStatus) params.set('accountStatus', request.accountStatus);
        if (request.role?.trim()) params.set('role', request.role.trim());
        if (request.activity) params.set('activity', request.activity);
        if (request.reportCountMin !== null && request.reportCountMin !== undefined) {
          params.set('reportCountMin', String(request.reportCountMin));
        }
        if (request.reportCountMax !== null && request.reportCountMax !== undefined) {
          params.set('reportCountMax', String(request.reportCountMax));
        }
        if (request.spendMin !== null && request.spendMin !== undefined) {
          params.set('spendMin', String(request.spendMin));
        }
        if (request.spendMax !== null && request.spendMax !== undefined) {
          params.set('spendMax', String(request.spendMax));
        }
        if (request.page) params.set('page', String(request.page));
        if (request.limit) params.set('limit', String(request.limit));

        const response = await fetch(getAdminUsersUrl(params), {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal,
        });

        const payload = await parseJsonSafely(response);
        if (!response.ok) {
          const payloadError =
            payload && typeof payload === 'object' && 'error' in payload
              ? (payload as { error?: unknown }).error
              : null;
          throw new Error(
            typeof payloadError === 'string' && payloadError.trim()
              ? payloadError
              : `Failed to fetch users: ${response.status}`,
          );
        }
        if (signal?.aborted) {
          return;
        }

        const nextUsers = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.users)
            ? payload.users
            : [];

        setUsers(nextUsers);
        setTotal(
          Number.parseInt(
            response.headers.get('x-total-count') ?? String(nextUsers.length),
            10,
          ) || 0,
        );
        const nextSpendAvailability =
          response.headers.get('x-spend-data-available') === 'true' ||
          nextUsers.some((user: AdminUserRecord) => typeof user?.spendTotal === 'number');
        setSpendDataAvailable((currentValue) => currentValue || nextSpendAvailability);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }

        setUsers([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : 'Failed to fetch users.');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    },
    [getToken, request, tokenTemplate],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchUsers(controller.signal);
    return () => controller.abort();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    hasLoaded,
    total,
    spendDataAvailable,
    refetch: useCallback(() => fetchUsers(), [fetchUsers]),
  };
}
