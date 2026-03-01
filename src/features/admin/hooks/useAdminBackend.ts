import { useCallback } from 'react';

import { useAuth } from '../../../auth/spacetimeSession';
import { fetchAdminJson } from '../utils/adminBackend';

type QueryParams = Record<string, unknown>;

export const ADMIN_NOT_CONNECTED_MESSAGE = 'Not connected';

function hasAdminApiConfig(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL?.trim() ||
      process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL?.trim() ||
      process.env.EXPO_PUBLIC_API_URL?.trim(),
  );
}

function normalizeAdminError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(ADMIN_NOT_CONNECTED_MESSAGE);
  }

  const message = error.message.trim();
  if (
    message.includes('Backend API is not configured') ||
    message.includes('Missing auth token') ||
    message === 'Failed to fetch' ||
    message === 'Network request failed' ||
    message === 'Load failed' ||
    message === 'The network connection was lost.'
  ) {
    return new Error(ADMIN_NOT_CONNECTED_MESSAGE);
  }

  return new Error(message || ADMIN_NOT_CONNECTED_MESSAGE);
}

export function useAdminBackend() {
  const { getToken } = useAuth();
  const isConnected = hasAdminApiConfig();

  const ensureAuth = useCallback(async () => {
    if (!isConnected) {
      throw new Error(ADMIN_NOT_CONNECTED_MESSAGE);
    }

    const token = await getToken();
    if (!token) {
      throw new Error(ADMIN_NOT_CONNECTED_MESSAGE);
    }

    return token;
  }, [getToken, isConnected]);

  const get = useCallback(
    async <T>(path: string, params?: QueryParams): Promise<T> => {
      const token = await ensureAuth();
      try {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params ?? {})) {
          if (value === null || value === undefined) {
            continue;
          }

          if (Array.isArray(value)) {
            value.forEach((entry) => searchParams.append(key, String(entry)));
            continue;
          }

          searchParams.set(key, String(value));
        }

        const requestPath = searchParams.toString() ? `${path}?${searchParams.toString()}` : path;
        return await fetchAdminJson<T>(requestPath, token);
      } catch (error) {
        throw normalizeAdminError(error);
      }
    },
    [ensureAuth],
  );

  const post = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const token = await ensureAuth();
      try {
        return await fetchAdminJson<T>(path, token, {
          body: body === undefined ? undefined : JSON.stringify(body),
          method: 'POST',
        });
      } catch (error) {
        throw normalizeAdminError(error);
      }
    },
    [ensureAuth],
  );

  const del = useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const token = await ensureAuth();
      try {
        return await fetchAdminJson<T>(path, token, {
          body: body === undefined ? undefined : JSON.stringify(body),
          method: 'DELETE',
        });
      } catch (error) {
        throw normalizeAdminError(error);
      }
    },
    [ensureAuth],
  );

  return {
    del,
    get,
    isConnected,
    post,
  };
}
