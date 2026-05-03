function normalize(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  );
}

function readExpoDevHost(): string | undefined {
  const configuredHost = normalize(process.env.EXPO_PUBLIC_DEV_SERVER_HOST);
  if (configuredHost) {
    return configuredHost;
  }

  if (typeof window !== 'undefined' && window.location?.hostname && !isLoopbackHost(window.location.hostname)) {
    return normalize(window.location.hostname);
  }

  try {
    const linkingModule = require('expo-linking') as {
      createURL?: (path?: string) => string;
    };
    const candidateUrl = normalize(linkingModule.createURL?.('/'));
    if (!candidateUrl) {
      return undefined;
    }

    const parsedCandidate = new URL(candidateUrl.replace(/^exp:/, 'http:').replace(/^exps:/, 'https:'));
    return isLoopbackHost(parsedCandidate.hostname) ? undefined : normalize(parsedCandidate.hostname);
  } catch {
    return undefined;
  }
}

export function resolveConfiguredHttpUrl(value: string | null | undefined): string | undefined {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (!isLoopbackHost(parsed.hostname)) {
      return parsed.toString().replace(/\/+$/, '');
    }

    const expoDevHost = readExpoDevHost();
    if (!expoDevHost) {
      return parsed.toString().replace(/\/+$/, '');
    }

    parsed.hostname = expoDevHost;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return normalized.replace(/\/+$/, '');
  }
}

function firstResolvedHttpUrl(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const resolved = resolveConfiguredHttpUrl(value);
    if (resolved) {
      return resolved;
    }
  }
  return '';
}

export function getConfiguredBackendBaseUrl(): string {
  return firstResolvedHttpUrl([
    process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL,
  ]);
}

export function getConfiguredAdminApiBaseUrl(): string {
  return firstResolvedHttpUrl([
    process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL,
    process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL,
  ]);
}

export function getConfiguredUploadSignerBaseUrl(): string {
  return firstResolvedHttpUrl([
    process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL,
  ]);
}

export function getConfiguredRealtimeWsBaseUrl(): string {
  const configuredWs = normalize(process.env.EXPO_PUBLIC_RAILWAY_WS_BASE_URL);
  if (configuredWs) {
    return configuredWs.replace(/\/+$/, '');
  }

  const httpBaseUrl = getConfiguredBackendBaseUrl();
  if (!httpBaseUrl) {
    return '';
  }

  try {
    const parsed = new URL(httpBaseUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return httpBaseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/+$/, '');
  }
}
