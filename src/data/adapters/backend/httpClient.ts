const DEFAULT_BACKEND_TIMEOUT_MS = 15_000;

function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getBackendBaseUrlFromEnv(): string {
  return (
    trim(process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL) ??
    trim(process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL) ??
    ''
  );
}

function getBackendTimeoutMsFromEnv(): number {
  const raw = trim(process.env.EXPO_PUBLIC_BACKEND_TIMEOUT_MS);
  if (!raw) return DEFAULT_BACKEND_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BACKEND_TIMEOUT_MS;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        query.append(key, String(entry));
      });
      continue;
    }
    query.set(key, String(value));
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function parseJsonSafely(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { text } : null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type BackendHttpClient = {
  setAuth: (token: string) => void;
  clearAuth: () => void;
  get: <T>(path: string, params?: Record<string, unknown>) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string, body?: unknown) => Promise<T>;
};

export function createBackendHttpClientFromEnv(): BackendHttpClient | null {
  const baseUrl = getBackendBaseUrlFromEnv();
  if (!baseUrl) {
    return null;
  }

  const timeoutMs = getBackendTimeoutMsFromEnv();
  let authToken: string | null = null;

  const request = async <T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options?: { params?: Record<string, unknown>; body?: unknown },
  ): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}${buildQueryString(
        options?.params,
      )}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: method === 'GET' ? undefined : JSON.stringify(options?.body ?? {}),
          signal: controller.signal,
        });
      } catch (error) {
        const isAbortError =
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as { name?: string }).name === 'AbortError';

        if (isAbortError) {
          throw new Error('Backend request timed out');
        }

        throw new Error(`Could not reach backend at ${baseUrl}`);
      }

      const payload = await parseJsonSafely(response);
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string'
            ? payload.error
            : `Backend request failed (${response.status})`;
        throw new Error(message);
      }

      return payload as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    setAuth(token: string) {
      authToken = token.trim() || null;
    },
    clearAuth() {
      authToken = null;
    },
    get(path, params) {
      return request('GET', path, { params });
    },
    post(path, body) {
      return request('POST', path, { body });
    },
    del(path, body) {
      return request('DELETE', path, { body });
    },
  };
}
