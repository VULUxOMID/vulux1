import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendRealtimeClient } from './realtimeClient';

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('realtime connect requests a ticket over HTTPS and does not place auth token in websocket URL query', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalDev = (globalThis as any).__DEV__;
  const originalAdminApiBaseUrl = process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL;
  const originalLegacyApiBaseUrl = process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
  const createdConnections: Array<{ url: string; protocols: string[] | undefined }> = [];
  const ticketRequests: Array<{ url: string; init?: RequestInit }> = [];

  class MockWebSocket {
    static readonly OPEN = 1;

    public readonly url: string;
    public readonly protocols: string[] | undefined;
    public readonly readyState = MockWebSocket.OPEN;
    public onopen: ((event: unknown) => void) | null = null;
    public onmessage: ((event: unknown) => void) | null = null;
    public onerror: ((event: unknown) => void) | null = null;
    public onclose: ((event: unknown) => void) | null = null;

    constructor(url: string | URL, protocols?: string | string[]) {
      this.url = typeof url === 'string' ? url : url.toString();
      this.protocols = Array.isArray(protocols) ? protocols : protocols ? [protocols] : undefined;
      createdConnections.push({
        url: this.url,
        protocols: this.protocols,
      });
    }

    send(): void {}

    close(): void {}
  }

  try {
    process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL = 'https://api.vulu.example';
    delete process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      ticketRequests.push({ url, init });
      return new Response(JSON.stringify({ ticket: 'ticket-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = MockWebSocket as any;

    const client = createBackendRealtimeClient();
    client.connect({
      getToken: async () => 'header.payload.signature',
      userId: 'viewer_1',
      onDataChanged: () => {},
    });

    await nextTick();
    client.disconnect();

    assert.equal(createdConnections.length, 1);
    assert.equal(ticketRequests.length, 1);
    assert.equal(ticketRequests[0]?.url, 'https://api.vulu.example/realtime/tickets');
    assert.equal(ticketRequests[0]?.init?.method, 'POST');
    assert.equal(
      (ticketRequests[0]?.init?.headers as Record<string, string> | undefined)?.Authorization,
      'Bearer header.payload.signature',
    );
    const connection = createdConnections[0];
    const wsUrl = new URL(connection.url);
    assert.equal(wsUrl.searchParams.get('token'), null);
    assert.equal(wsUrl.searchParams.get('userId'), 'viewer_1');
    assert.deepEqual(connection.protocols, [
      'vulu.realtime.v1',
      'vulu.auth.ticket.ticket-123',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = originalDev;
    if (originalAdminApiBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL = originalAdminApiBaseUrl;
    }
    if (originalLegacyApiBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL = originalLegacyApiBaseUrl;
    }
    globalThis.WebSocket = originalWebSocket;
  }
});

test('repeated realtime connects fetch a fresh ticket before opening a new socket', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalDev = (globalThis as any).__DEV__;
  const originalAdminApiBaseUrl = process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL;
  const originalLegacyApiBaseUrl = process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
  const createdConnections: Array<MockRealtimeSocket> = [];
  const ticketRequests: string[] = [];
  const issuedTickets = ['ticket-1', 'ticket-2'];

  class MockRealtimeSocket {
    static readonly OPEN = 1;

    public readonly url: string;
    public readonly protocols: string[] | undefined;
    public readonly readyState = MockRealtimeSocket.OPEN;
    public onopen: ((event: unknown) => void) | null = null;
    public onmessage: ((event: unknown) => void) | null = null;
    public onerror: ((event: unknown) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;

    constructor(url: string | URL, protocols?: string | string[]) {
      this.url = typeof url === 'string' ? url : url.toString();
      this.protocols = Array.isArray(protocols) ? protocols : protocols ? [protocols] : undefined;
      createdConnections.push(this);
    }

    send(): void {}

    close(): void {}
  }

  try {
    process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL = 'https://api.vulu.example';
    delete process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      ticketRequests.push(url);
      const ticket = issuedTickets.shift() ?? 'fallback-ticket';
      return new Response(JSON.stringify({ ticket }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = MockRealtimeSocket as any;

    const client = createBackendRealtimeClient();
    client.connect({
      getToken: async () => 'header.payload.signature',
      userId: 'viewer_1',
      onDataChanged: () => {},
    });

    await nextTick();
    client.disconnect();
    client.connect({
      getToken: async () => 'header.payload.signature',
      userId: 'viewer_1',
      onDataChanged: () => {},
    });
    await nextTick();
    client.disconnect();

    assert.equal(ticketRequests.length, 2);
    assert.equal(createdConnections.length, 2);
    assert.deepEqual(createdConnections[0]?.protocols, [
      'vulu.realtime.v1',
      'vulu.auth.ticket.ticket-1',
    ]);
    assert.deepEqual(createdConnections[1]?.protocols, [
      'vulu.realtime.v1',
      'vulu.auth.ticket.ticket-2',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = originalDev;
    if (originalAdminApiBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL = originalAdminApiBaseUrl;
    }
    if (originalLegacyApiBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL = originalLegacyApiBaseUrl;
    }
    globalThis.WebSocket = originalWebSocket;
  }
});
