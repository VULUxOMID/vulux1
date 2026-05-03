export const REALTIME_EVENT_CONTRACT_VERSION = "realtime-event.v1" as const;

export type RealtimeEventEnvelope = {
  event_id: string;
  correlation_id: string;
  idempotency_key: string;
  occurred_at: string;
  schema_version: number;
  event_type: string;
  actor_id?: string | null;
  room_id?: string | null;
  payload: Record<string, unknown>;
};

export type RealtimeEventAcceptedEnvelope = {
  ok: true;
  code: "accepted" | "duplicate_accepted";
  requestId: string;
  correlationId: string;
  contractVersion: typeof REALTIME_EVENT_CONTRACT_VERSION;
  eventId: string;
};
