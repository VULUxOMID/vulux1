import { randomUUID } from "node:crypto";

const DEFAULT_REALTIME_TICKET_TTL_MS = 30_000;

export function createRealtimeTicketStore(options = {}) {
  const ttlMs =
    typeof options.ttlMs === "number" && Number.isFinite(options.ttlMs) && options.ttlMs > 0
      ? Math.floor(options.ttlMs)
      : DEFAULT_REALTIME_TICKET_TTL_MS;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const tickets = new Map();

  function pruneExpiredTickets(currentTime) {
    for (const [ticket, record] of tickets.entries()) {
      if (record.expiresAt <= currentTime) {
        tickets.delete(ticket);
      }
    }
  }

  return {
    ttlMs,
    issue(viewerUserId) {
      const normalizedViewerUserId = String(viewerUserId ?? "").trim();
      if (!normalizedViewerUserId) {
        throw new Error("viewerUserId is required to issue a realtime ticket.");
      }

      const issuedAt = now();
      pruneExpiredTickets(issuedAt);
      const ticket = randomUUID();
      tickets.set(ticket, {
        viewerUserId: normalizedViewerUserId,
        expiresAt: issuedAt + ttlMs,
      });
      return {
        ticket,
        expiresAt: issuedAt + ttlMs,
      };
    },
    consume(ticket) {
      const normalizedTicket = String(ticket ?? "").trim();
      if (!normalizedTicket) {
        throw new Error("Realtime ticket is required.");
      }

      const currentTime = now();
      pruneExpiredTickets(currentTime);
      const record = tickets.get(normalizedTicket);
      if (!record) {
        throw new Error("Realtime ticket is invalid or expired.");
      }

      tickets.delete(normalizedTicket);
      if (record.expiresAt <= currentTime) {
        throw new Error("Realtime ticket is invalid or expired.");
      }

      return {
        viewerUserId: record.viewerUserId,
        expiresAt: record.expiresAt,
      };
    },
    size() {
      pruneExpiredTickets(now());
      return tickets.size;
    },
  };
}

export { DEFAULT_REALTIME_TICKET_TTL_MS };
