function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getAdminBackendRootUrl(): string {
  const configuredBaseUrl =
    trim(process.env.EXPO_PUBLIC_API_BASE_URL) ??
    trim(process.env.EXPO_PUBLIC_BACKEND_API_URL) ??
    trim(process.env.EXPO_PUBLIC_API_URL);

  if (!configuredBaseUrl) {
    throw new Error('Backend API is not configured.');
  }

  const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/api')
    ? normalizedBaseUrl.slice(0, -4)
    : normalizedBaseUrl;
}

function buildAdminBackendUrl(path: string): string {
  return `${getAdminBackendRootUrl()}/${path.replace(/^\/+/, '')}`;
}

async function parseJsonSafely(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { error: text } : null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchAdminJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  if (!token) {
    throw new Error('Missing auth token.');
  }

  const response = await fetch(buildAdminBackendUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload as T;
}
