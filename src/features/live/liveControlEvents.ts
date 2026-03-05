export type LiveControlEvent =
  | { eventType: 'live_host_request'; requesterUserId: string; createdAt: number }
  | {
      eventType: 'live_host_request_response';
      targetUserId: string;
      accepted: boolean;
      createdAt: number;
    }
  | { eventType: 'live_invite'; targetUserId: string; createdAt: number }
  | {
      eventType: 'live_invite_response';
      targetUserId: string;
      accepted: boolean;
      createdAt: number;
    };

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readTimestampMs(value: unknown): number {
  const direct = asFiniteNumber(value);
  if (direct !== null) return direct;

  if (value && typeof value === 'object') {
    const asObject = value as {
      toMillis?: () => unknown;
      microsSinceUnixEpoch?: unknown;
      __timestamp_micros_since_unix_epoch__?: unknown;
    };
    if (typeof asObject.toMillis === 'function') {
      const millis = asFiniteNumber(asObject.toMillis());
      if (millis !== null) return millis;
    }
    const micros = asObject.microsSinceUnixEpoch ?? asObject.__timestamp_micros_since_unix_epoch__;
    const microsAsNumber = asFiniteNumber(micros);
    if (microsAsNumber !== null) return Math.floor(microsAsNumber / 1000);
  }

  return Date.now();
}

function parseJsonRecord(itemRaw: unknown): Record<string, unknown> {
  if (typeof itemRaw !== 'string') return {};
  try {
    const parsed = JSON.parse(itemRaw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeRoomId(value: unknown): string {
  return asString(value)?.toLowerCase() ?? '';
}

export function parseLiveControlEvents(globalRows: any[], liveId: string): LiveControlEvent[] {
  const normalizedLiveRoomId = normalizeRoomId(liveId);
  if (!normalizedLiveRoomId) return [];

  const parsed: LiveControlEvent[] = [];
  globalRows.forEach((row) => {
    const rowRoomId = normalizeRoomId(row?.roomId ?? row?.room_id);
    if (rowRoomId !== normalizedLiveRoomId) return;

    const payload = parseJsonRecord(row?.item);
    const eventType = asString(payload.eventType);
    if (!eventType) return;

    const createdAt =
      asFiniteNumber(payload.createdAt) ??
      readTimestampMs(row?.createdAt ?? row?.created_at);

    if (eventType === 'live_host_request') {
      const requesterUserId = asString(payload.requesterUserId) ?? asString(payload.userId);
      if (!requesterUserId) return;
      parsed.push({
        eventType,
        requesterUserId,
        createdAt,
      });
      return;
    }

    if (eventType === 'live_host_request_response') {
      const targetUserId = asString(payload.targetUserId) ?? asString(payload.requesterUserId);
      if (!targetUserId) return;
      parsed.push({
        eventType,
        targetUserId,
        accepted: payload.accepted === true,
        createdAt,
      });
      return;
    }

    if (eventType === 'live_invite') {
      const targetUserId = asString(payload.targetUserId);
      if (!targetUserId) return;
      parsed.push({
        eventType,
        targetUserId,
        createdAt,
      });
      return;
    }

    if (eventType === 'live_invite_response') {
      const targetUserId = asString(payload.targetUserId) ?? asString(payload.responderUserId);
      if (!targetUserId) return;
      parsed.push({
        eventType,
        targetUserId,
        accepted: payload.accepted === true,
        createdAt,
      });
    }
  });

  parsed.sort((a, b) => a.createdAt - b.createdAt);
  return parsed;
}

export function derivePendingHostRequestIds(events: LiveControlEvent[]): string[] {
  const pending = new Set<string>();
  events.forEach((event) => {
    if (event.eventType === 'live_host_request') {
      pending.add(event.requesterUserId);
      return;
    }
    if (event.eventType === 'live_host_request_response') {
      pending.delete(event.targetUserId);
    }
  });
  return Array.from(pending);
}

export function derivePendingHostInviteIds(events: LiveControlEvent[]): string[] {
  const pending = new Set<string>();
  events.forEach((event) => {
    if (event.eventType === 'live_invite') {
      pending.add(event.targetUserId);
      return;
    }
    if (event.eventType === 'live_invite_response') {
      pending.delete(event.targetUserId);
    }
  });
  return Array.from(pending);
}
