#!/usr/bin/env node

import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 15_000;

function env(name) {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRunId() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${suffix}`;
}

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function createActor(label) {
  const token = env(`SMOKE_TOKEN_${label}`) ?? (label === "A" ? env("SMOKE_TOKEN") : undefined);
  const userId =
    env(`SMOKE_USER_ID_${label}`) ?? (label === "A" ? env("SMOKE_USER_ID") : undefined);
  return {
    label,
    token,
    userId,
    resolvedUserId: null,
  };
}

function actorHasAuth(actor) {
  return Boolean(actor.token || actor.userId);
}

function actorHeaders(actor) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (!actor) return headers;
  if (actor.token) {
    headers.Authorization = `Bearer ${actor.token}`;
  }
  if (actor.userId) {
    headers["x-vulu-user-id"] = actor.userId;
  }
  return headers;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { text };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function request({
  baseUrl,
  timeoutMs,
  method,
  path,
  actor = null,
  query = undefined,
  body = undefined,
  expectedStatuses = [200],
}) {
  const url = new URL(path, baseUrl);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const entry of value) {
          url.searchParams.append(key, String(entry));
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: actorHeaders(actor),
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    const data = await parseResponseBody(response);
    if (!expectedStatuses.includes(response.status)) {
      const printable = JSON.stringify(data);
      throw new Error(
        `[${method} ${path}] unexpected status ${response.status}. body=${printable}`,
      );
    }

    return {
      status: response.status,
      data,
      headers: response.headers,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function assertEventually(description, checkFn, options = {}) {
  const attempts = Number.isFinite(options.attempts) ? options.attempts : 5;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 350;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await checkFn();
      if (result) return;
      lastError = new Error(`${description} (attempt ${attempt}/${attempts})`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }
  throw lastError ?? new Error(description);
}

function findConversation(snapshot, otherUserId) {
  return ensureArray(snapshot?.conversations).find(
    (conversation) => conversation && conversation.otherUserId === otherUserId,
  );
}

function findThreadMessage(snapshot, otherUserId, messageId) {
  const threadsByUser = ensureObject(snapshot?.threadSeedMessagesByUserId);
  const messages = ensureArray(threadsByUser[otherUserId]);
  return messages.find((message) => message && message.id === messageId);
}

function findLive(snapshot, liveId) {
  return ensureArray(snapshot?.lives).find((live) => live && live.id === liveId);
}

function findPresence(snapshot, userId, liveId) {
  return ensureArray(snapshot?.livePresence).find(
    (entry) => entry && entry.userId === userId && entry.liveId === liveId,
  );
}

function logHeader(title) {
  console.log(`\n== ${title} ==`);
}

function logStep(message) {
  console.log(`• ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function resolveActorUserId(baseUrl, timeoutMs, actor) {
  const profile = await request({
    baseUrl,
    timeoutMs,
    method: "GET",
    path: "/profile",
    actor,
  });

  const userId = profile?.data?.profile?.id;
  if (typeof userId !== "string" || userId.trim().length === 0) {
    fail(`Could not resolve viewer user id for actor ${actor.label} from /profile`);
  }
  actor.resolvedUserId = userId.trim();
}

async function main() {
  const baseUrl = env("SMOKE_BASE_URL") ?? env("EXPO_PUBLIC_API_BASE_URL") ?? DEFAULT_BASE_URL;
  const timeoutMs = toInteger(env("SMOKE_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS);
  const runId = buildRunId();

  const actorA = createActor("A");
  const actorB = createActor("B");
  const hasActorA = actorHasAuth(actorA);
  const hasActorB = actorHasAuth(actorB);

  const smokeDmOtherUserId = env("SMOKE_DM_OTHER_USER_ID");
  const useSingleActorDmMode = !hasActorB;

  const smokeLiveId = `smoke-live-${runId}`;
  const smokeMessageId = `smoke-dm-${runId}`;
  const smokeMessageText = `Smoke DM ${runId}`;

  let shouldCleanupLive = false;
  let shouldCleanupPresenceA = false;
  let shouldCleanupPresenceB = false;

  console.log("Vulu API smoke test");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Run ID: ${runId}`);

  try {
    logHeader("Health");
    const health = await request({
      baseUrl,
      timeoutMs,
      method: "GET",
      path: "/health",
    });
    if (health?.data?.ok !== true) {
      fail("/health did not return ok=true");
    }
    logStep("GET /health passed");

    logHeader("Auth Setup");
    if (!hasActorA) {
      fail(
        "Missing auth for actor A. Set SMOKE_TOKEN_A or SMOKE_USER_ID_A (if insecure header auth is enabled).",
      );
    }

    await resolveActorUserId(baseUrl, timeoutMs, actorA);
    logStep(`Actor A resolved as ${actorA.resolvedUserId}`);

    if (hasActorB) {
      await resolveActorUserId(baseUrl, timeoutMs, actorB);
      logStep(`Actor B resolved as ${actorB.resolvedUserId}`);
    } else {
      logStep("Actor B auth not provided; DM/read verification will run in single-actor mode");
    }

    logHeader("Snapshot");
    await request({
      baseUrl,
      timeoutMs,
      method: "GET",
      path: "/snapshot",
      actor: actorA,
    });
    logStep("GET /snapshot as actor A passed");

    logHeader("DM Flow");
    const dmTargetUserId =
      !useSingleActorDmMode &&
      actorB.resolvedUserId &&
      actorB.resolvedUserId !== actorA.resolvedUserId
        ? actorB.resolvedUserId
        : smokeDmOtherUserId ?? `smoke-peer-${runId}`;

    await request({
      baseUrl,
      timeoutMs,
      method: "POST",
      path: "/messages/thread/send",
      actor: actorA,
      body: {
        userId: dmTargetUserId,
        clientMessageId: smokeMessageId,
        message: {
          id: smokeMessageId,
          user: "Smoke A",
          senderId: actorA.resolvedUserId,
          text: smokeMessageText,
          createdAt: Date.now(),
        },
      },
    });
    logStep("POST /messages/thread/send passed");

    await assertEventually(
      "Actor A thread should include smoke message",
      async () => {
        const snapshot = await request({
          baseUrl,
          timeoutMs,
          method: "GET",
          path: "/snapshot",
          actor: actorA,
        });
        const message = findThreadMessage(snapshot.data, dmTargetUserId, smokeMessageId);
        return Boolean(message && message.text === smokeMessageText);
      },
      { attempts: 6, delayMs: 400 },
    );
    logStep("Actor A sees sent DM in thread snapshot");

    if (!useSingleActorDmMode && actorB.resolvedUserId === dmTargetUserId) {
      await assertEventually(
        "Actor B thread should include smoke message",
        async () => {
          const snapshot = await request({
            baseUrl,
            timeoutMs,
            method: "GET",
            path: "/snapshot",
            actor: actorB,
          });
          return Boolean(findThreadMessage(snapshot.data, actorA.resolvedUserId, smokeMessageId));
        },
        { attempts: 6, delayMs: 400 },
      );
      logStep("Actor B sees received DM in thread snapshot");

      await request({
        baseUrl,
        timeoutMs,
        method: "POST",
        path: "/messages/conversation/mark-read",
        actor: actorB,
        body: {
          userId: actorA.resolvedUserId,
        },
      });
      logStep("POST /messages/conversation/mark-read passed");

      await assertEventually(
        "Actor B conversation unreadCount should be zero",
        async () => {
          const snapshot = await request({
            baseUrl,
            timeoutMs,
            method: "GET",
            path: "/snapshot",
            actor: actorB,
          });
          const conversation = findConversation(snapshot.data, actorA.resolvedUserId);
          return conversation && Number(conversation.unreadCount ?? 0) === 0;
        },
        { attempts: 6, delayMs: 400 },
      );
      logStep("Actor B conversation unreadCount reset to 0");
    } else {
      logStep("Skipped cross-user DM verification because actor B is unavailable or same user as actor A");
    }

    logHeader("Live Flow");
    await request({
      baseUrl,
      timeoutMs,
      method: "POST",
      path: "/live/start",
      actor: actorA,
      body: {
        liveId: smokeLiveId,
        title: `Smoke Live ${runId}`,
        viewers: 1,
      },
    });
    shouldCleanupLive = true;
    logStep("POST /live/start passed");

    await assertEventually(
      "Live should appear in actor A snapshot",
      async () => {
        const snapshot = await request({
          baseUrl,
          timeoutMs,
          method: "GET",
          path: "/snapshot",
          actor: actorA,
        });
        return Boolean(findLive(snapshot.data, smokeLiveId));
      },
      { attempts: 6, delayMs: 400 },
    );
    logStep("Actor A snapshot includes created live");

    await request({
      baseUrl,
      timeoutMs,
      method: "POST",
      path: "/live/presence",
      actor: actorA,
      body: {
        activity: "hosting",
        liveId: smokeLiveId,
        liveTitle: `Smoke Live ${runId}`,
      },
    });
    shouldCleanupPresenceA = true;
    logStep("Actor A hosting presence set");

    await assertEventually(
      "Actor A hosting presence should appear",
      async () => {
        const snapshot = await request({
          baseUrl,
          timeoutMs,
          method: "GET",
          path: "/snapshot",
          actor: actorA,
        });
        const presence = findPresence(snapshot.data, actorA.resolvedUserId, smokeLiveId);
        return Boolean(presence && presence.activity === "hosting");
      },
      { attempts: 6, delayMs: 400 },
    );
    logStep("Actor A presence validated");

    if (!useSingleActorDmMode && actorB.resolvedUserId && actorB.resolvedUserId !== actorA.resolvedUserId) {
      await request({
        baseUrl,
        timeoutMs,
        method: "POST",
        path: "/live/presence",
        actor: actorB,
        body: {
          activity: "watching",
          liveId: smokeLiveId,
        },
      });
      shouldCleanupPresenceB = true;
      logStep("Actor B watching presence set");

      await assertEventually(
        "Actor B watching presence should appear",
        async () => {
          const snapshot = await request({
            baseUrl,
            timeoutMs,
            method: "GET",
            path: "/snapshot",
            actor: actorB,
          });
          const presence = findPresence(snapshot.data, actorB.resolvedUserId, smokeLiveId);
          return Boolean(presence && presence.activity === "watching");
        },
        { attempts: 6, delayMs: 400 },
      );
      logStep("Actor B presence validated");
    } else {
      logStep("Skipped actor B live presence verification");
    }

    await request({
      baseUrl,
      timeoutMs,
      method: "POST",
      path: "/live/end",
      actor: actorA,
      body: {
        liveId: smokeLiveId,
      },
    });
    shouldCleanupLive = false;
    logStep("POST /live/end passed");

    await assertEventually(
      "Live should be removed after /live/end",
      async () => {
        const snapshot = await request({
          baseUrl,
          timeoutMs,
          method: "GET",
          path: "/snapshot",
          actor: actorA,
        });
        return !findLive(snapshot.data, smokeLiveId);
      },
      { attempts: 6, delayMs: 400 },
    );
    logStep("Live removal validated");

    console.log("\nSmoke test completed successfully.");
  } finally {
    // Best-effort cleanup of test live/presence state.
    try {
      if (shouldCleanupLive && actorHasAuth(actorA)) {
        await request({
          baseUrl,
          timeoutMs,
          method: "POST",
          path: "/live/end",
          actor: actorA,
          body: {
            liveId: smokeLiveId,
          },
          expectedStatuses: [200, 400, 403, 404],
        });
      }
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (shouldCleanupPresenceA && actorHasAuth(actorA)) {
        await request({
          baseUrl,
          timeoutMs,
          method: "POST",
          path: "/live/presence",
          actor: actorA,
          body: {
            activity: "none",
          },
          expectedStatuses: [200, 400, 401, 403],
        });
      }
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (shouldCleanupPresenceB && actorHasAuth(actorB)) {
        await request({
          baseUrl,
          timeoutMs,
          method: "POST",
          path: "/live/presence",
          actor: actorB,
          body: {
            activity: "none",
          },
          expectedStatuses: [200, 400, 401, 403],
        });
      }
    } catch {
      // Ignore cleanup errors.
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSmoke test failed: ${message}`);
  process.exitCode = 1;
});
