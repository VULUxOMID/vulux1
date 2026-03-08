import test from "node:test";
import assert from "node:assert/strict";

import { createRealtimeTicketStore } from "./realtimeTickets.js";

test("issued realtime ticket can be consumed once", () => {
  let nowMs = 1_000;
  const store = createRealtimeTicketStore({
    ttlMs: 30_000,
    now: () => nowMs,
  });

  const issued = store.issue("viewer_123");
  assert.match(issued.ticket, /^[0-9a-f-]{36}$/i);
  assert.equal(store.size(), 1);

  const consumed = store.consume(issued.ticket);
  assert.equal(consumed.viewerUserId, "viewer_123");
  assert.equal(store.size(), 0);
});

test("consumed realtime ticket cannot be reused", () => {
  const store = createRealtimeTicketStore();
  const issued = store.issue("viewer_123");

  store.consume(issued.ticket);

  assert.throws(() => store.consume(issued.ticket), /invalid or expired/i);
});

test("expired realtime ticket is rejected", () => {
  let nowMs = 1_000;
  const store = createRealtimeTicketStore({
    ttlMs: 10,
    now: () => nowMs,
  });

  const issued = store.issue("viewer_123");
  nowMs += 11;

  assert.throws(() => store.consume(issued.ticket), /invalid or expired/i);
});
