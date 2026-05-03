import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { emptySnapshot, isRailwayDataConfigured } from "./railwayData.js";

test("emptySnapshot exposes all app snapshot buckets", () => {
  const snapshot = emptySnapshot();

  assert.deepEqual(snapshot.lives, []);
  assert.deepEqual(snapshot.socialUsers, []);
  assert.deepEqual(snapshot.acceptedFriendIds, []);
  assert.deepEqual(snapshot.notifications, []);
  assert.deepEqual(snapshot.videos, []);
  assert.deepEqual(snapshot.tracks, []);
  assert.deepEqual(snapshot.conversations, []);
  assert.deepEqual(snapshot.threadSeedMessagesByUserId, {});
  assert.equal(snapshot.wallet, null);
  assert.deepEqual(snapshot.searchIndex.users, []);
});

test("Railway data layer stays optional without DATABASE_URL", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.equal(isRailwayDataConfigured(), false);
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});

test("initial Railway migration includes durable app domains", async () => {
  const sql = await readFile(new URL("../migrations/001_initial_railway_schema.sql", import.meta.url), "utf8");
  const requiredTables = [
    "app_users",
    "friendships",
    "conversations",
    "messages",
    "notifications",
    "wallet_accounts",
    "wallet_transactions",
    "withdrawal_requests",
    "media_assets",
    "live_rooms",
    "live_presence",
    "moderation_reports",
  ];

  for (const tableName of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`));
  }
});

test("friendships compatibility migration backfills expected snapshot columns", async () => {
  const sql = await readFile(
    new URL("../migrations/002_friendships_compatibility_columns.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS requester_user_id/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS addressee_user_id/i);
  assert.match(sql, /requested_by/i);
  assert.match(sql, /user_low_id/i);
  assert.match(sql, /user_high_id/i);
});
