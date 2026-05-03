import { getConfiguredBackendBaseUrl } from '../../config/backendBaseUrl';
import type { DemoInvite, DemoRoom, DemoStateSnapshot } from './types';

type DemoApiErrorPayload = {
  error?: string;
  details?: Record<string, unknown>;
};

export class DemoApiError extends Error {
  statusCode: number;
  details: Record<string, unknown> | null;

  constructor(message: string, statusCode = 500, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'DemoApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getDemoBaseUrl(): string {
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    throw new DemoApiError(
      'Demo backend is not configured. Set EXPO_PUBLIC_RAILWAY_API_BASE_URL and start backend/server.js.',
      503,
    );
  }
  return baseUrl.replace(/\/+$/, '');
}

function buildUrl(path: string, query?: Record<string, string | null | undefined>): string {
  const url = new URL(`${getDemoBaseUrl()}/${path.replace(/^\/+/, '')}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (!value) return;
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function parsePayload(response: Response): Promise<DemoApiErrorPayload | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text ? { error: text } : null;
  }

  try {
    return (await response.json()) as DemoApiErrorPayload | null;
  } catch {
    return null;
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    body?: Record<string, unknown>;
    query?: Record<string, string | null | undefined>;
  },
): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(options?.body ?? {}),
  });

  const payload = await parsePayload(response);
  if (!response.ok) {
    throw new DemoApiError(
      payload?.error || `Demo request failed (${response.status})`,
      response.status,
      payload?.details ?? null,
    );
  }

  return payload as T;
}

export async function loginDemo(username: string): Promise<{ username: string }> {
  return request('POST', '/demo/login', {
    body: { username },
  });
}

export async function fetchDemoState(username: string): Promise<DemoStateSnapshot> {
  return request('GET', '/demo/state', {
    query: { username },
  });
}

export async function fetchDemoRoom(roomId: string, username: string): Promise<{ room: DemoRoom }> {
  return request('GET', `/demo/rooms/${encodeURIComponent(roomId)}`, {
    query: { username },
  });
}

export async function createDemoRoom(
  hostUsername: string,
  title: string,
): Promise<{ room: DemoRoom }> {
  return request('POST', '/demo/rooms', {
    body: { hostUsername, title },
  });
}

export async function startDemoRoom(roomId: string, username: string): Promise<{ room: DemoRoom }> {
  return request('POST', `/demo/rooms/${encodeURIComponent(roomId)}/start`, {
    body: { username },
  });
}

export async function joinDemoRoom(roomId: string, username: string): Promise<{ room: DemoRoom }> {
  return request('POST', `/demo/rooms/${encodeURIComponent(roomId)}/join`, {
    body: { username },
  });
}

export async function leaveDemoRoom(roomId: string, username: string): Promise<{ room: DemoRoom }> {
  return request('POST', `/demo/rooms/${encodeURIComponent(roomId)}/leave`, {
    body: { username },
  });
}

export async function inviteDemoUser(
  roomId: string,
  username: string,
  targetUsername: string,
): Promise<{ room: DemoRoom; invite: DemoInvite }> {
  return request('POST', `/demo/rooms/${encodeURIComponent(roomId)}/invite`, {
    body: { username, targetUsername },
  });
}

export async function respondToDemoInvite(
  inviteId: string,
  username: string,
  accept: boolean,
): Promise<{ room: DemoRoom; invite: DemoInvite }> {
  return request('POST', `/demo/invites/${encodeURIComponent(inviteId)}/respond`, {
    body: { username, accept },
  });
}
