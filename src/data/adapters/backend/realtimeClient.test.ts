import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendRealtimeClient } from './realtimeClient';

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('realtime connect does not place auth token in websocket URL query', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalRailwayWsBaseUrl = process.env.EXPO_PUBLIC_RAILWAY_WS_BASE_URL;
  const createdConnections: Array<{ url: string; protocols: string[] | undefined }> = [];

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
    process.env.EXPO_PUBLIC_RAILWAY_WS_BASE_URL = 'wss://api.vulu.example/realtime';
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
    const connection = createdConnections[0];
    const wsUrl = new URL(connection.url);
    assert.equal(wsUrl.searchParams.get('token'), null);
    assert.equal(wsUrl.searchParams.get('userId'), 'viewer_1');
    assert.deepEqual(connection.protocols, [
      'vulu.realtime.v1',
      'vulu.auth.bearer.header.payload.signature',
    ]);
  } finally {
    if (originalRailwayWsBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_RAILWAY_WS_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_RAILWAY_WS_BASE_URL = originalRailwayWsBaseUrl;
    }
    globalThis.WebSocket = originalWebSocket;
  }
});
