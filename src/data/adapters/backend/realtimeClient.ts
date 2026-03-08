import { getBackendToken } from '../../../utils/backendToken';
import { getBackendTokenTemplate } from '../../../config/backendToken';

type DataChangedEvent = {
  type: 'data_changed';
  eventId?: string;
  reason?: string;
  scopes?: string[];
  createdAt?: number;
};

type BackendRealtimeEvent = DataChangedEvent | { type: string; [key: string]: unknown };

export type BackendRealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

const ENDPOINT_NOT_FOUND_COOLDOWN_MS = 5 * 60_000;
const MAX_RECONNECT_BACKOFF_MS = 60_000;
const REALTIME_PROTOCOL = 'vulu.realtime.v1';
const REALTIME_TICKET_PROTOCOL_PREFIX = 'vulu.auth.ticket.';

function isMissingRealtimeEndpoint(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('404') && normalized.includes('bad response code');
}

type ConnectOptions = {
  getToken: () => Promise<string | null>;
  userId?: string | null;
  onDataChanged: (event: DataChangedEvent) => void;
  onStatusChange?: (status: BackendRealtimeStatus) => void;
};

function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function getRealtimeBaseUrlFromEnv(): string | null {
  const httpBaseUrl =
    trim(process.env.EXPO_PUBLIC_ADMIN_API_BASE_URL) ??
    trim(process.env.EXPO_PUBLIC_LEGACY_API_BASE_URL);
  if (!httpBaseUrl) return null;

  try {
    const url = new URL(httpBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${normalizedPath}/realtime`.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function parseEvent(rawData: unknown): BackendRealtimeEvent | null {
  if (typeof rawData !== 'string') return null;
  try {
    const parsed = JSON.parse(rawData) as BackendRealtimeEvent;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.type !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function getRealtimeTicketUrl(realtimeBaseUrl: string): string {
  const url = new URL(realtimeBaseUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/tickets`;
  url.search = '';
  url.hash = '';
  return url.toString();
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

async function issueRealtimeTicket(realtimeBaseUrl: string, token: string): Promise<string> {
  const response = await fetch(getRealtimeTicketUrl(realtimeBaseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `Realtime ticket request failed (${response.status})`;
    throw new Error(message);
  }

  const ticket =
    payload && typeof payload.ticket === 'string' ? payload.ticket.trim() : '';
  if (!ticket) {
    throw new Error('Realtime ticket response did not include a ticket.');
  }
  return ticket;
}

function buildRealtimeProtocols(ticket: string): string[] {
  return [REALTIME_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`];
}

export type BackendRealtimeClient = {
  connect: (options: ConnectOptions) => void;
  disconnect: () => void;
};

class BackendRealtimeClientImpl implements BackendRealtimeClient {
  private readonly realtimeBaseUrl = getRealtimeBaseUrlFromEnv();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private opening = false;
  private status: BackendRealtimeStatus = 'disconnected';
  private options: ConnectOptions | null = null;
  private authRejectedUntilMs = 0;
  private endpointUnavailableUntilMs = 0;

  connect(options: ConnectOptions): void {
    this.options = options;
    this.manuallyClosed = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.openSocket();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.opening = false;
    this.options = null;
    this.clearReconnectTimer();
    this.closeSocket();
  }

  private openSocket(): void {
    const baseUrl = this.realtimeBaseUrl;
    if (!baseUrl || !this.options) return;
    if (this.socket || this.opening) return;
    if (Date.now() < this.endpointUnavailableUntilMs) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }
    this.opening = true;
    const targetStatus: BackendRealtimeStatus =
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    this.setStatus(targetStatus);

    void (async () => {
      let connectionUrl = baseUrl;
      let connectionProtocols: string[] = [];
      try {
        const token = await getBackendToken(
          this.options?.getToken ?? (async () => null),
          getBackendTokenTemplate(),
        );
        if (!token || !this.options) {
          this.opening = false;
          this.setStatus('disconnected');
          this.scheduleReconnect();
          return;
        }

        const url = new URL(baseUrl);
        if (this.options.userId) {
          url.searchParams.set('userId', this.options.userId);
        }
        connectionUrl = url.toString();
        const ticket = await issueRealtimeTicket(baseUrl, token);
        connectionProtocols = buildRealtimeProtocols(ticket);
      } catch {
        this.opening = false;
        this.setStatus('disconnected');
        this.scheduleReconnect();
        return;
      }

      const socket = new WebSocket(connectionUrl, connectionProtocols);
      this.socket = socket;

      socket.onopen = () => {
        this.opening = false;
        this.reconnectAttempt = 0;
        this.endpointUnavailableUntilMs = 0;
        this.setStatus('connected');
        this.startHeartbeat();
      };

      socket.onmessage = (event) => {
        const parsedEvent = parseEvent(event.data);
        if (!parsedEvent) return;
        if (parsedEvent.type !== 'data_changed') return;
        const dataChangedEvent = parsedEvent as DataChangedEvent;
        this.options?.onDataChanged(dataChangedEvent);
        this.acknowledgeDataChanged(socket, dataChangedEvent);
      };

      socket.onerror = () => {
        // Connection lifecycle is handled by onclose.
      };

      socket.onclose = (event) => {
        this.opening = false;
        this.stopHeartbeat();
        if (this.socket === socket) {
          this.socket = null;
        }
        if (__DEV__) {
          const reason = typeof event.reason === 'string' ? event.reason : '';
          console.log('[data/realtime] socket closed', {
            code: event.code,
            reason,
            wasClean: event.wasClean,
          });
          if (isMissingRealtimeEndpoint(reason)) {
            console.log(
              '[data/realtime] websocket endpoint unavailable; pausing reconnect attempts',
            );
          }
        }
        if (isMissingRealtimeEndpoint(event.reason ?? '')) {
          this.endpointUnavailableUntilMs = Date.now() + ENDPOINT_NOT_FOUND_COOLDOWN_MS;
        }
        if (event.code === 4401 || event.code === 4403) {
          this.authRejectedUntilMs = Date.now() + 60_000;
        }
        this.setStatus('disconnected');
        if (!this.manuallyClosed) {
          this.scheduleReconnect();
        }
      };
    })();
  }

  private scheduleReconnect(): void {
    if (!this.options) return;
    if (this.manuallyClosed) return;
    this.clearReconnectTimer();
    const endpointCooldownMs = Math.max(0, this.endpointUnavailableUntilMs - Date.now());
    const authCooldownMs = Math.max(0, this.authRejectedUntilMs - Date.now());
    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempt), MAX_RECONNECT_BACKOFF_MS);
    const delayMs = Math.max(endpointCooldownMs, authCooldownMs, backoffMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      try {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Ignore ping failures; onclose will handle reconnect.
      }
    }, 25000);
  }

  private acknowledgeDataChanged(socket: WebSocket, event: DataChangedEvent): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const eventId = typeof event.eventId === 'string' ? event.eventId.trim() : '';
    if (!eventId) return;

    const payload: {
      type: 'ack';
      eventId: string;
      deliveryLatencyMs?: number;
    } = {
      type: 'ack',
      eventId,
    };

    const createdAtMs = event.createdAt;
    if (typeof createdAtMs === 'number' && Number.isFinite(createdAtMs)) {
      payload.deliveryLatencyMs = Math.max(0, Date.now() - createdAtMs);
    }

    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Ignore ack failures; reconnect flow already handles socket lifecycle.
    }
  }

  private stopHeartbeat(): void {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setStatus(nextStatus: BackendRealtimeStatus): void {
    if (this.status === nextStatus) return;
    this.status = nextStatus;
    this.options?.onStatusChange?.(nextStatus);
  }

  private closeSocket(): void {
    this.stopHeartbeat();
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
    this.setStatus('disconnected');
  }
}

export function createBackendRealtimeClient(): BackendRealtimeClient {
  return new BackendRealtimeClientImpl();
}
