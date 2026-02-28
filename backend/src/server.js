import cors from "cors";
import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";
import {
  generatePresignedUrl,
  getPublicUrlForObjectKey,
  isR2Configured,
  isR2PublicUrlConfigured,
} from "./r2.js";

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 5000);
const databaseUrl = process.env.DATABASE_URL;
const authJwksUrl = process.env.AUTH_JWKS_URL;
const authWebhookSecret =
  typeof process.env.AUTH_WEBHOOK_SECRET === "string" && process.env.AUTH_WEBHOOK_SECRET.trim().length > 0
    ? process.env.AUTH_WEBHOOK_SECRET.trim()
    : null;
const authWebhookToleranceSeconds = Number.parseInt(
  process.env.AUTH_WEBHOOK_TOLERANCE_SECONDS ?? "",
  10,
);
const effectiveAuthWebhookToleranceSeconds =
  Number.isFinite(authWebhookToleranceSeconds) && authWebhookToleranceSeconds > 0
    ? authWebhookToleranceSeconds
    : 300;
const authWebhookSigningKey = authWebhookSecret
  ? Buffer.from(
    authWebhookSecret.startsWith("whsec_")
      ? authWebhookSecret.slice("whsec_".length)
      : authWebhookSecret,
    "base64",
  )
  : null;
const authJwtIssuer =
  typeof process.env.AUTH_JWT_ISSUER === "string" && process.env.AUTH_JWT_ISSUER.trim().length > 0
    ? process.env.AUTH_JWT_ISSUER.trim()
    : null;
const authJwtAudienceList = (
  typeof process.env.AUTH_JWT_AUDIENCE === "string" ? process.env.AUTH_JWT_AUDIENCE : ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowInsecureUserIdHeaderAuth =
  typeof process.env.ALLOW_INSECURE_USER_HEADER_AUTH === "string" &&
  process.env.ALLOW_INSECURE_USER_HEADER_AUTH.trim().toLowerCase() === "true";
const realtimeLatencySampleLimit = Number.parseInt(
  process.env.REALTIME_LATENCY_SAMPLE_LIMIT ?? "",
  10,
);
const realtimeMetricsLogIntervalMs = Number.parseInt(
  process.env.REALTIME_METRICS_LOG_INTERVAL_MS ?? "",
  10,
);
const livePresenceTtlMs = Number.parseInt(process.env.LIVE_PRESENCE_TTL_MS ?? "", 10);
const liveHostStaleGraceMs = Number.parseInt(process.env.LIVE_HOST_STALE_GRACE_MS ?? "", 10);
const effectiveRealtimeLatencySampleLimit =
  Number.isFinite(realtimeLatencySampleLimit) && realtimeLatencySampleLimit > 0
    ? realtimeLatencySampleLimit
    : 500;
const effectiveRealtimeMetricsLogIntervalMs =
  Number.isFinite(realtimeMetricsLogIntervalMs) && realtimeMetricsLogIntervalMs > 0
    ? realtimeMetricsLogIntervalMs
    : 60_000;
const effectiveLivePresenceTtlMs =
  Number.isFinite(livePresenceTtlMs) && livePresenceTtlMs > 0 ? livePresenceTtlMs : 120_000;
const effectiveLiveHostStaleGraceMs =
  Number.isFinite(liveHostStaleGraceMs) && liveHostStaleGraceMs > 0 ? liveHostStaleGraceMs : 45_000;
const maxPendingRealtimeAcksPerSocket = 2_000;
const MAX_ADMIN_WALLET_CREDIT_AMOUNT = 1_000_000_000;
const MAX_ADMIN_WALLET_CREDIT_REASON_LENGTH = 240;
const ADMIN_WITHDRAWAL_WORKFLOW_STATUSES = new Set([
  "pending",
  "approved",
  "denied",
  "processing",
  "completed",
]);
const ADMIN_EXPORT_PERMISSION = "EXPORT_DATA";
const EXPORTABLE_ADMIN_DATASETS = {
  audit_logs: {
    tableName: "audit_logs",
    filePrefix: "audit-logs",
    createdAtColumn: "ts",
    columns: [
      "id",
      "ts",
      "actor_admin_id",
      "actor_role",
      "action_type",
      "target_type",
      "target_id",
      "reason",
      "metadata",
      "result",
      "error_message",
      "admin_user_id",
      "created_at",
      "payload",
    ],
    filterColumns: {
      adminUserId: "actor_admin_id",
      actionType: "action_type",
      targetType: "target_type",
      targetId: "target_id",
    },
  },
  user_reports: {
    tableName: "moderation_reports",
    filePrefix: "user-reports",
    createdAtColumn: "created_at",
    columns: [
      "id",
      "scope",
      "message_id",
      "reported_user_id",
      "context_key",
      "status",
      "reason",
      "payload",
      "linked_ticket_id",
      "escalated_at",
      "escalated_by_admin_id",
      "created_at",
      "updated_at",
    ],
    filterColumns: {
      reportedUserId: "reported_user_id",
      scope: "scope",
      status: "status",
      messageId: "message_id",
      contextKey: "context_key",
    },
  },
  moderation_actions: {
    tableName: "moderation_actions",
    filePrefix: "moderation-actions",
    createdAtColumn: "created_at",
    columns: [
      "id",
      "admin_user_id",
      "target_type",
      "target_id",
      "action_type",
      "reason",
      "payload",
      "created_at",
    ],
    filterColumns: {
      adminUserId: "admin_user_id",
      actionType: "action_type",
      targetType: "target_type",
      targetId: "target_id",
    },
  },
};
const ADMIN_HEALTH_ERROR_WINDOW_MS = 5 * 60 * 1000;
const MAX_ADMIN_ALERT_HISTORY = 20;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!authJwksUrl) {
  console.warn("AUTH_JWKS_URL is not configured. Only x-vulu-user-id fallback auth will work.");
}
if (!authWebhookSecret) {
  console.warn("AUTH_WEBHOOK_SECRET is not configured. /webhooks/auth requests will be rejected.");
}

const jwks = authJwksUrl ? createRemoteJWKSet(new URL(authJwksUrl)) : null;
const jwtVerifyOptions = {
  clockTolerance: 5,
  ...(authJwtIssuer ? { issuer: authJwtIssuer } : {}),
  ...(authJwtAudienceList.length > 0
    ? {
      audience:
        authJwtAudienceList.length === 1 ? authJwtAudienceList[0] : authJwtAudienceList,
    }
    : {}),
};

if (jwks && authJwtAudienceList.length === 0) {
  console.warn("AUTH_JWT_AUDIENCE is not configured. Any Auth-issued token will be accepted.");
}
if (jwks && allowInsecureUserIdHeaderAuth) {
  console.warn(
    "ALLOW_INSECURE_USER_HEADER_AUTH=true is enabled. x-vulu-user-id auth bypass is active.",
  );
}
if (jwks) {
  console.log("[auth] Auth JWT verification configured", {
    issuer: authJwtIssuer ?? null,
    audiences: authJwtAudienceList,
  });
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost")
    ? false
    : {
      rejectUnauthorized: false,
    },
});

const realtimeConnectionsByUserId = new Map();
const realtimePendingEventsBySocket = new WeakMap();
const realtimeLatencySamplesMs = [];
const realtimeMetrics = {
  wsConnectionsOpened: 0,
  wsConnectionsClosed: 0,
  wsAuthFailures: 0,
  wsMessagesReceived: 0,
  wsPingsReceived: 0,
  wsAcksReceived: 0,
  wsDataChangedSent: 0,
  wsSendFailures: 0,
};
let activeRealtimeServer = null;
const recentHttpRequestOutcomes = [];
const adminIncidentCenterState = {
  maintenanceMode: {
    enabled: false,
    message: "",
    updatedAt: null,
    updatedBy: null,
  },
  ongoingIncident: null,
  recentAlerts: [],
};

function getActiveRealtimeConnectionCount() {
  let total = 0;
  for (const sockets of realtimeConnectionsByUserId.values()) {
    total += sockets.size;
  }
  return total;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function recordRealtimeLatencySample(latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  realtimeLatencySamplesMs.push(latencyMs);
  if (realtimeLatencySamplesMs.length > effectiveRealtimeLatencySampleLimit) {
    realtimeLatencySamplesMs.splice(
      0,
      realtimeLatencySamplesMs.length - effectiveRealtimeLatencySampleLimit,
    );
  }
}

function getRealtimeMetricsSnapshot() {
  const latencies = [...realtimeLatencySamplesMs].sort((a, b) => a - b);
  const p50Ms = percentile(latencies, 0.5);
  const p95Ms = percentile(latencies, 0.95);

  return {
    ...realtimeMetrics,
    activeUsers: realtimeConnectionsByUserId.size,
    activeConnections: getActiveRealtimeConnectionCount(),
    latencySampleCount: latencies.length,
    latencyP50Ms: p50Ms !== null ? Number(p50Ms.toFixed(2)) : null,
    latencyP95Ms: p95Ms !== null ? Number(p95Ms.toFixed(2)) : null,
  };
}

function logRealtimeMetrics(reason) {
  console.log("[realtime] metrics", {
    reason,
    ...getRealtimeMetricsSnapshot(),
  });
}

function trimRecentHttpRequestOutcomes() {
  const cutoff = nowMs() - ADMIN_HEALTH_ERROR_WINDOW_MS;
  while (
    recentHttpRequestOutcomes.length > 0 &&
    recentHttpRequestOutcomes[0]?.timestamp < cutoff
  ) {
    recentHttpRequestOutcomes.shift();
  }
}

function recordHttpRequestOutcome(statusCode) {
  recentHttpRequestOutcomes.push({
    timestamp: nowMs(),
    isError:
      Number.isFinite(statusCode) &&
      Number.isInteger(statusCode) &&
      Number(statusCode) >= 500,
  });
  trimRecentHttpRequestOutcomes();
}

function getHttpRequestHealthSnapshot() {
  trimRecentHttpRequestOutcomes();
  const requestCount = recentHttpRequestOutcomes.length;
  const errorCount = recentHttpRequestOutcomes.reduce(
    (count, sample) => count + (sample.isError ? 1 : 0),
    0,
  );

  return {
    windowMs: ADMIN_HEALTH_ERROR_WINDOW_MS,
    requestCount,
    errorCount,
    rate: requestCount > 0 ? Number((errorCount / requestCount).toFixed(4)) : 0,
  };
}

function normalizeIncidentSeverity(value) {
  const normalized = asString(value).trim().toLowerCase();
  switch (normalized) {
    case "critical":
    case "danger":
      return "critical";
    case "success":
    case "resolved":
      return "success";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

function canManageSystemRole(role) {
  return hasAdminPermission(role, ADMIN_PERMISSIONS.MANAGE_SYSTEM);
}

function cloneIncidentAlert(alert) {
  if (!alert) return null;
  return { ...alert };
}

function getIncidentCenterSnapshot(role) {
  return {
    maintenanceMode: { ...adminIncidentCenterState.maintenanceMode },
    ongoingIncident: cloneIncidentAlert(adminIncidentCenterState.ongoingIncident),
    recentAlerts: adminIncidentCenterState.recentAlerts.map((alert) => ({ ...alert })),
    permissions: {
      canManageSystem: canManageSystemRole(role),
      canBroadcastAlert: hasAdminPermission(role, ADMIN_PERMISSIONS.BROADCAST_ALERT),
    },
  };
}

function emitAdminBroadcastAlert(alert) {
  if (!activeRealtimeServer?.clients) {
    return 0;
  }

  let deliveredCount = 0;
  for (const socket of activeRealtimeServer.clients) {
    if (
      sendRealtime(socket, {
        type: "admin_alert",
        alert,
        createdAt: nowMs(),
      })
    ) {
      deliveredCount += 1;
    }
  }
  return deliveredCount;
}

function recordAdminAlert({
  title,
  message,
  severity = "info",
  kind = "broadcast",
  createdBy = null,
  broadcast = false,
}) {
  const alert = {
    id: randomUUID(),
    title: asString(title).trim(),
    message: asString(message).trim(),
    severity: normalizeIncidentSeverity(severity),
    kind: asString(kind).trim() || "broadcast",
    createdAt: new Date().toISOString(),
    createdBy: asString(createdBy) || null,
    deliveredCount: 0,
  };

  if (broadcast) {
    alert.deliveredCount = emitAdminBroadcastAlert(alert);
  }

  adminIncidentCenterState.recentAlerts.unshift(alert);
  if (adminIncidentCenterState.recentAlerts.length > MAX_ADMIN_ALERT_HISTORY) {
    adminIncidentCenterState.recentAlerts.splice(MAX_ADMIN_ALERT_HISTORY);
  }

  return { ...alert };
}

function normalizeUserIds(value) {
  if (!Array.isArray(value)) return [];
  const normalized = new Set();
  for (const userId of value) {
    const nextUserId = asString(userId);
    if (nextUserId) {
      normalized.add(nextUserId);
    }
  }
  return Array.from(normalized);
}

function sendRealtime(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    realtimeMetrics.wsSendFailures += 1;
    return false;
  }
}

function addRealtimeConnection(userId, socket) {
  const normalizedUserId = asString(userId);
  if (!normalizedUserId) return;

  let userSockets = realtimeConnectionsByUserId.get(normalizedUserId);
  if (!userSockets) {
    userSockets = new Set();
    realtimeConnectionsByUserId.set(normalizedUserId, userSockets);
  }
  userSockets.add(socket);
}

function removeRealtimeConnection(userId, socket) {
  const normalizedUserId = asString(userId);
  if (!normalizedUserId) return;

  const userSockets = realtimeConnectionsByUserId.get(normalizedUserId);
  if (!userSockets) return;

  userSockets.delete(socket);
  if (userSockets.size === 0) {
    realtimeConnectionsByUserId.delete(normalizedUserId);
  }
}

function emitRealtimeDataChanged({ userIds, scopes, reason }) {
  const normalizedScopes = Array.isArray(scopes)
    ? scopes
      .map((scope) => asString(scope))
      .filter(Boolean)
    : [];
  const eventId = randomUUID();
  const createdAt = nowMs();
  const payload = {
    type: "data_changed",
    eventId,
    reason: asString(reason) ?? "update",
    scopes: Array.from(new Set(normalizedScopes)),
    createdAt,
  };

  const recordSocketEventSent = (socket) => {
    if (!sendRealtime(socket, payload)) return;
    realtimeMetrics.wsDataChangedSent += 1;
    const pendingEvents = realtimePendingEventsBySocket.get(socket);
    if (!pendingEvents) return;
    if (pendingEvents.size >= maxPendingRealtimeAcksPerSocket) {
      const oldestEventId = pendingEvents.keys().next().value;
      if (oldestEventId) {
        pendingEvents.delete(oldestEventId);
      }
    }
    pendingEvents.set(eventId, createdAt);
  };

  const targetUserIds = normalizeUserIds(userIds);
  if (targetUserIds.length > 0) {
    for (const targetUserId of targetUserIds) {
      const userSockets = realtimeConnectionsByUserId.get(targetUserId);
      if (!userSockets) continue;
      for (const socket of userSockets) {
        recordSocketEventSent(socket);
      }
    }
    return;
  }

  for (const userSockets of realtimeConnectionsByUserId.values()) {
    for (const socket of userSockets) {
      recordSocketEventSent(socket);
    }
  }
}

app.use(cors());
app.use("/webhooks/auth", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.on("finish", () => {
    recordHttpRequestOutcome(res.statusCode);

    if (!shouldAutoAuditAdminRequest(req)) {
      return;
    }

    void writeAutomaticAdminAuditLog(req, res.statusCode);
  });
  next();
});

function nowMs() {
  return Date.now();
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value == null) return "";
  return String(value);
}

function toStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => asString(item)).filter(Boolean);
}

function asQueryString(value) {
  if (Array.isArray(value)) {
    return asString(value[0]);
  }
  return asString(value);
}

function parsePositiveInteger(value, fallback, max = Number.POSITIVE_INFINITY) {
  const parsed = Number.parseInt(asQueryString(value) ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseNullableInteger(value) {
  const rawValue = asQueryString(value).trim();
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(parsed, 0);
}

function parseNullableNumber(value) {
  const rawValue = asQueryString(value).trim();
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeSqlLikeValue(value) {
  return asString(value).replace(/[\\%_]/g, "\\$&");
}

function buildAdminEmailPartialSearch(queryText) {
  const normalizedQuery = asString(queryText).trim().toLowerCase();
  if (normalizedQuery.length < 3) {
    return null;
  }

  const escapedQuery = escapeSqlLikeValue(normalizedQuery);
  if (normalizedQuery.includes("@")) {
    return {
      field: "email",
      pattern: `${escapedQuery}%`,
    };
  }

  return {
    field: "emailLocalPart",
    pattern: `${escapedQuery}%`,
  };
}

function normalizeAdminUserSortBy(value) {
  const normalized = (asString(value) ?? "").replace(/[^a-z]/gi, "").toLowerCase();
  switch (normalized) {
    case "id":
      return "id";
    case "username":
      return "username";
    case "email":
      return "email";
    case "role":
      return "role";
    case "accountstatus":
      return "accountStatus";
    case "joindate":
      return "joinDate";
    case "lastactive":
      return "lastActive";
    case "presencestatus":
      return "presenceStatus";
    case "reportcount":
      return "reportCount";
    case "activity":
      return "activity";
    case "spend":
    case "spendtotal":
      return "spendTotal";
    default:
      return "joinDate";
  }
}

function normalizeSortDirection(value) {
  return (asString(value) ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeIsoDate(value, fallbackIso = new Date(0).toISOString()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const nextDate = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(nextDate.getTime()) ? fallbackIso : nextDate.toISOString();
  }

  const rawValue = asString(value);
  if (!rawValue) {
    return fallbackIso;
  }

  if (/^\d+$/.test(rawValue)) {
    const numericValue = Number.parseInt(rawValue, 10);
    if (Number.isFinite(numericValue)) {
      const nextDate = new Date(rawValue.length >= 13 ? numericValue : numericValue * 1000);
      if (!Number.isNaN(nextDate.getTime())) {
        return nextDate.toISOString();
      }
    }
  }

  const parsedDate = Date.parse(rawValue);
  if (Number.isFinite(parsedDate)) {
    return new Date(parsedDate).toISOString();
  }

  return fallbackIso;
}

function asOptionalString(value) {
  const normalized = asString(value).trim();
  return normalized ? normalized : null;
}

function normalizeAuditLogResult(value) {
  return asString(value).toLowerCase() === "fail" ? "fail" : "success";
}

function normalizeAuditLogFilterDate(value, boundary) {
  const rawValue = asString(value).trim();
  if (!rawValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return boundary === "end"
      ? `${rawValue}T23:59:59.999Z`
      : `${rawValue}T00:00:00.000Z`;
  }

  const parsed = Date.parse(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function mapAuditLogRow(row) {
  return {
    id: asString(row?.id),
    ts: normalizeIsoDate(row?.ts ?? row?.created_at),
    actorAdminId: asString(row?.actor_admin_id ?? row?.admin_user_id),
    actorRole: asString(row?.actor_role) || "admin",
    actionType: asString(row?.action_type),
    targetType: asString(row?.target_type),
    targetId: asString(row?.target_id),
    reason: asString(row?.reason),
    metadata: safeObject(row?.metadata ?? row?.payload),
    result: normalizeAuditLogResult(row?.result),
    errorMessage: asOptionalString(row?.error_message),
  };
}

async function insertAuditLog(entry, db = pool) {
  const metadata = safeObject(entry?.metadata);
  const result = await db.query(
    `
      insert into audit_logs (
        actor_admin_id,
        actor_role,
        action_type,
        target_type,
        target_id,
        reason,
        metadata,
        result,
        error_message
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      returning *
    `,
    [
      asString(entry?.actorAdminId ?? entry?.adminUserId) || "unknown-admin",
      asString(entry?.actorRole) || "admin",
      asString(entry?.actionType) || "UNKNOWN_ACTION",
      asString(entry?.targetType) || "system",
      asString(entry?.targetId),
      asString(entry?.reason),
      toJson(metadata),
      normalizeAuditLogResult(entry?.result),
      asOptionalString(entry?.errorMessage),
    ],
  );

  return mapAuditLogRow(result.rows[0]);
}

async function listAuditLogsPage(options = {}) {
  const page = parsePositiveInteger(options.page, 1, 100000);
  const limit = parsePositiveInteger(options.limit, 20, 100);
  const actionType = asOptionalString(options.actionType);
  const actor = asOptionalString(options.actor);
  const targetId = asOptionalString(options.targetId);
  const dateFrom = normalizeAuditLogFilterDate(options.dateFrom, "start");
  const dateTo = normalizeAuditLogFilterDate(options.dateTo, "end");
  const whereClauses = [];
  const values = [];

  if (actionType) {
    values.push(`%${actionType.toLowerCase()}%`);
    whereClauses.push(`lower(action_type) like $${values.length}`);
  }

  if (actor) {
    values.push(`%${actor.toLowerCase()}%`);
    whereClauses.push(`lower(actor_admin_id) like $${values.length}`);
  }

  if (targetId) {
    values.push(`%${targetId.toLowerCase()}%`);
    whereClauses.push(`lower(target_id) like $${values.length}`);
  }

  if (dateFrom) {
    values.push(dateFrom);
    whereClauses.push(`ts >= $${values.length}::timestamptz`);
  }

  if (dateTo) {
    values.push(dateTo);
    whereClauses.push(`ts <= $${values.length}::timestamptz`);
  }

  const whereSql = whereClauses.length ? `where ${whereClauses.join(" and ")}` : "";
  const offset = (page - 1) * limit;
  values.push(limit + 1);
  const limitPosition = values.length;
  values.push(offset);
  const offsetPosition = values.length;

  const result = await pool.query(
    `
      select *
      from audit_logs
      ${whereSql}
      order by ts desc, id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values,
  );

  return {
    logs: result.rows.slice(0, limit).map(mapAuditLogRow),
    page,
    limit,
    hasMore: result.rows.length > limit,
  };
}

function buildRequestAuditLog(req, entry = {}) {
  return {
    actorAdminId: asString(entry.actorAdminId) || asString(req?.viewerUserId) || "unknown-admin",
    actorRole: asString(entry.actorRole) || asString(req?.viewerRole) || "admin",
    actionType: asString(entry.actionType),
    targetType: asString(entry.targetType) || "system",
    targetId: asString(entry.targetId),
    reason: asString(entry.reason),
    metadata: safeObject(entry.metadata),
    result: normalizeAuditLogResult(entry.result),
    errorMessage: asOptionalString(entry.errorMessage),
  };
}

function shouldAutoAuditAdminRequest(req) {
  if (req?.skipAutoAdminAudit === true) {
    return false;
  }

  const requestPath = asString(req?.path);
  if (!requestPath) {
    return false;
  }

  return /^\/(?:admin|api\/admin)(?:\/|$)/.test(requestPath);
}

function normalizeAutomaticAuditActionType(req) {
  const routePath = asString(req?.route?.path) || asString(req?.path) || "admin";
  const normalizedPath = routePath
    .replace(/^\/+/, "")
    .replace(/[:/.-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const normalizedMethod = asString(req?.method).toUpperCase() || "REQUEST";
  return `${normalizedMethod}_${normalizedPath || "ADMIN"}`;
}

function inferAutomaticAuditTargetType(req) {
  const rawPath = `${asString(req?.baseUrl)}/${asString(req?.route?.path) || asString(req?.path)}`
    .toLowerCase();

  if (rawPath.includes("withdraw")) return "withdrawal";
  if (rawPath.includes("ticket")) return "ticket";
  if (rawPath.includes("report")) return "report";
  if (rawPath.includes("message")) return "message";
  if (rawPath.includes("user")) return "user";
  if (rawPath.includes("wallet")) return "wallet";
  if (rawPath.includes("incident")) return "incident";
  if (rawPath.includes("export")) return "export";
  if (rawPath.includes("live")) return "live";
  if (rawPath.includes("audit")) return "audit";
  return "system";
}

function inferAutomaticAuditTargetId(req) {
  const sources = [
    safeObject(req?.params),
    safeObject(req?.body),
    safeObject(req?.query),
  ];
  const keys = [
    "targetId",
    "id",
    "requestId",
    "userId",
    "messageId",
    "liveId",
    "reportId",
    "transactionId",
    "exportId",
    "roomId",
  ];

  for (const source of sources) {
    for (const key of keys) {
      const value = asOptionalString(source[key]);
      if (value) {
        return value;
      }
    }
  }

  return "";
}

function inferAutomaticAuditReason(req, statusCode) {
  const body = safeObject(req?.body);
  return (
    asOptionalString(body.reason) ??
    asOptionalString(body.message) ??
    `${asString(req?.method).toUpperCase() || "REQUEST"} ${asString(req?.path)} (${statusCode})`
  );
}

function buildAutomaticAuditMetadata(req, statusCode) {
  return {
    method: asString(req?.method).toUpperCase() || "REQUEST",
    path: asString(req?.path) || null,
    routePath: asString(req?.route?.path) || null,
    statusCode,
    params: safeObject(req?.params),
    query: safeObject(req?.query),
    body: isRecord(req?.body) ? req.body : {},
  };
}

async function writeAutomaticAdminAuditLog(req, statusCode) {
  try {
    const viewerUserId = asString(req?.viewerUserId) || "unknown-admin";
    const viewerRole =
      asString(req?.viewerRole) ||
      (viewerUserId && viewerUserId !== "unknown-admin"
        ? await resolveStoredUserRole(viewerUserId)
        : "unknown");

    await insertAuditLog({
      actorAdminId: viewerUserId,
      actorRole: viewerRole,
      actionType: normalizeAutomaticAuditActionType(req),
      targetType: inferAutomaticAuditTargetType(req),
      targetId: inferAutomaticAuditTargetId(req),
      reason: inferAutomaticAuditReason(req, statusCode),
      metadata: buildAutomaticAuditMetadata(req, statusCode),
      result: statusCode >= 400 ? "fail" : "success",
      errorMessage: statusCode >= 400 ? `HTTP ${statusCode}` : null,
    });
  } catch (error) {
    console.error("[audit] automatic audit log failed", error);
  }
}

function safeObject(value) {
  return isRecord(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toJson(value) {
  return JSON.stringify(value);
}

const SUPPORT_TICKET_STATUSES = new Set([
  "open",
  "investigating",
  "resolved",
  "closed",
]);
const SUPPORT_TICKET_PRIORITIES = new Set([
  "low",
  "normal",
  "high",
  "urgent",
]);

function normalizeSupportTicketStatus(value, fallback = "open") {
  const normalized = asString(value).trim().toLowerCase();
  if (SUPPORT_TICKET_STATUSES.has(normalized)) {
    return normalized;
  }

  if (fallback == null) {
    return null;
  }

  const fallbackStatus = asString(fallback).trim().toLowerCase();
  return SUPPORT_TICKET_STATUSES.has(fallbackStatus) ? fallbackStatus : null;
}

function normalizeSupportTicketPriority(value, fallback = "normal") {
  const normalized = asString(value).trim().toLowerCase();
  if (SUPPORT_TICKET_PRIORITIES.has(normalized)) {
    return normalized;
  }

  if (fallback == null) {
    return null;
  }

  const fallbackPriority = asString(fallback).trim().toLowerCase();
  return SUPPORT_TICKET_PRIORITIES.has(fallbackPriority) ? fallbackPriority : null;
}

function serializeSupportTicketNote(noteValue, index) {
  const note = safeObject(noteValue);
  const fallbackCreatedAt = new Date(0).toISOString();
  const body = asString(note.body) || asString(note.text);
  const adminId = asString(note.adminId) || null;

  return {
    id: asString(note.id) || `note-${index + 1}`,
    body,
    adminId,
    createdAt: normalizeIsoDate(
      note.createdAt ?? note.created_at ?? note.timestamp,
      fallbackCreatedAt,
    ),
  };
}

function serializeSupportTicketStatusHistoryEntry(entryValue, index, fallbackStatus) {
  const entry = safeObject(entryValue);
  const fallbackCreatedAt = new Date(0).toISOString();
  const adminId = asString(entry.adminId) || null;

  return {
    id: asString(entry.id) || `history-${index + 1}`,
    fromStatus: normalizeSupportTicketStatus(entry.fromStatus, null),
    toStatus:
      normalizeSupportTicketStatus(
        entry.toStatus ?? entry.status,
        fallbackStatus,
      ) ?? fallbackStatus,
    reason: asString(entry.reason),
    adminId,
    createdAt: normalizeIsoDate(
      entry.createdAt ?? entry.created_at ?? entry.timestamp,
      fallbackCreatedAt,
    ),
  };
}

function serializeSupportTicketRow(rowValue) {
  const row = safeObject(rowValue);
  const status = normalizeSupportTicketStatus(row.status, "open") ?? "open";
  const createdAt = normalizeIsoDate(row.created_at);

  return {
    id: asString(row.id),
    createdAt,
    userId: asString(row.user_id),
    category: asString(row.category) || "general",
    priority: normalizeSupportTicketPriority(row.priority, "normal"),
    status,
    assigneeAdminId: asString(row.assignee_admin_id) || null,
    notes: safeArray(row.notes).map((note, index) =>
      serializeSupportTicketNote(note, index),
    ),
    statusHistory: safeArray(row.status_history).map((entry, index) =>
      serializeSupportTicketStatusHistoryEntry(entry, index, status),
    ),
    updatedAt: normalizeIsoDate(row.updated_at, createdAt),
  };
}

const ALLOWED_SOCIAL_STATUSES = new Set(["live", "online", "busy", "offline", "recent"]);

function normalizeSocialStatusValue(value, fallback = null) {
  const normalized = asString(value).toLowerCase();
  if (ALLOWED_SOCIAL_STATUSES.has(normalized)) {
    return normalized;
  }

  if (fallback == null) return null;
  const fallbackNormalized = asString(fallback).toLowerCase();
  if (ALLOWED_SOCIAL_STATUSES.has(fallbackNormalized)) {
    return fallbackNormalized;
  }

  return null;
}

function socialStatusIsOnline(status) {
  const normalized = normalizeSocialStatusValue(status);
  return normalized === "live" || normalized === "online" || normalized === "busy";
}

function resolveSocialStatusFromItem(item) {
  const normalizedStatus = normalizeSocialStatusValue(item?.status);
  if (normalizedStatus) return normalizedStatus;
  if (item?.isLive === true) return "live";
  if (item?.isOnline === true) return "online";
  return "offline";
}

function parseSvixV1Signatures(headerValue) {
  const normalizedHeader = asString(headerValue);
  if (!normalizedHeader) {
    return [];
  }

  const signatures = [];
  const signatureMatches = normalizedHeader.matchAll(/v1,([a-zA-Z0-9+/=_-]+)/g);
  for (const signatureMatch of signatureMatches) {
    const signature = asString(signatureMatch[1]);
    if (signature) {
      signatures.push(signature);
    }
  }

  return signatures;
}

function isAuthWebhookSignatureValid({ payloadBuffer, svixId, svixTimestamp, svixSignatureHeader }) {
  if (!Buffer.isBuffer(payloadBuffer)) {
    return false;
  }
  if (!authWebhookSigningKey || authWebhookSigningKey.length === 0) {
    return false;
  }

  const normalizedSvixId = asString(svixId);
  const normalizedSvixTimestamp = asString(svixTimestamp);
  const signatures = parseSvixV1Signatures(svixSignatureHeader);
  if (!normalizedSvixId || !normalizedSvixTimestamp || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number.parseInt(normalizedSvixTimestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(nowMs() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > effectiveAuthWebhookToleranceSeconds) {
    return false;
  }

  const payloadText = payloadBuffer.toString("utf8");
  const signedContent = `${normalizedSvixId}.${normalizedSvixTimestamp}.${payloadText}`;
  const expectedSignature = createHmac("sha256", authWebhookSigningKey)
    .update(signedContent)
    .digest("base64");
  const expectedBuffer = Buffer.from(expectedSignature);

  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature);
    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, actualBuffer);
  });
}

function extractAuthPrimaryEmail(authUserPayload) {
  const payload = safeObject(authUserPayload);
  const emailAddresses = safeArray(payload.email_addresses).map((entry) => safeObject(entry));
  const primaryEmailAddressId = asString(payload.primary_email_address_id);

  if (primaryEmailAddressId) {
    const primaryEntry = emailAddresses.find((entry) => asString(entry.id) === primaryEmailAddressId);
    const primaryEmail = asString(primaryEntry?.email_address);
    if (primaryEmail) {
      return primaryEmail;
    }
  }

  for (const emailAddressEntry of emailAddresses) {
    const emailAddress = asString(emailAddressEntry.email_address);
    if (emailAddress) {
      return emailAddress;
    }
  }

  return undefined;
}

function deriveAuthDisplayName(authUserPayload, fallbackUserId) {
  const payload = safeObject(authUserPayload);
  const username = asString(payload.username);
  if (username) {
    return username;
  }

  const fullName = [asString(payload.first_name), asString(payload.last_name)].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  const email = extractAuthPrimaryEmail(payload);
  if (email) {
    const [emailPrefix] = email.split("@");
    if (emailPrefix?.trim()) {
      return emailPrefix.trim();
    }
  }

  return fallbackUserId;
}

function parseLiveViewerCount(value, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeLiveTitle(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 80);
}

function normalizeLiveHost(value) {
  const item = safeObject(value);
  const id = asString(item.id);
  const username = asString(item.username);
  const name = asString(item.name) ?? username ?? id;
  if (!name) return null;

  const normalizedUsername =
    username ?? name.toLowerCase().replace(/\s+/g, "_").slice(0, 40);

  return {
    id,
    username: normalizedUsername,
    name,
    age:
      typeof item.age === "number" && Number.isFinite(item.age)
        ? Math.max(0, Math.floor(item.age))
        : 0,
    country: asString(item.country) ?? "",
    bio: asString(item.bio) ?? "",
    verified: item.verified === true,
    avatar: asString(item.avatar) ?? "",
  };
}

function normalizeLiveHosts(value) {
  const hosts = [];
  const seen = new Set();
  for (const rawHost of safeArray(value)) {
    const host = normalizeLiveHost(rawHost);
    if (!host) continue;
    const key = host.id ? `id:${host.id}` : `${host.name.toLowerCase()}::${host.avatar}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hosts.push(host);
  }
  return hosts;
}

function normalizeLivePresenceItem(value) {
  const item = safeObject(value);
  const userId = asString(item.userId);
  const activity = asString(item.activity);
  const liveId = asString(item.liveId);
  const liveTitle = asString(item.liveTitle);

  if (!userId || !activity || !liveId) return null;
  if (!["hosting", "watching"].includes(activity)) return null;

  return {
    userId,
    activity,
    liveId,
    liveTitle: liveTitle ? liveTitle.slice(0, 80) : undefined,
    updatedAt:
      typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
        ? item.updatedAt
        : nowMs(),
  };
}

function deriveUsername(userId, state) {
  const username = asString(state.username);
  if (username) return username;
  const displayName = asString(state.displayName);
  if (displayName) return displayName;
  const email = asString(state.email);
  if (email) {
    const [prefix] = email.split("@");
    if (prefix?.trim()) return prefix.trim();
  }
  return userId;
}

function getFriendshipPair(userAId, userBId) {
  const [userLowId, userHighId] =
    userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  return {
    userLowId,
    userHighId,
    pairKey: `${userLowId}::${userHighId}`,
  };
}

function shouldHideNotificationItem(item) {
  if (!isRecord(item) || item.type !== "activity") return false;
  const metadata = safeObject(item.metadata);
  const metadataType = asString(metadata.type);
  if (metadataType === "open_dm") return true;

  const activityType = asString(item.activityType);
  if (activityType === "dm") return true;

  const source = asString(metadata.channel) ?? asString(metadata.scope) ?? asString(metadata.source);
  return source === "dm" || source === "direct_message";
}

function normalizeMessage(rawMessage, senderId, senderName, fallbackMessageId) {
  const source = safeObject(rawMessage);
  const createdAt = typeof source.createdAt === "number" ? source.createdAt : nowMs();
  const id =
    asString(source.id) ?? asString(source.clientMessageId) ?? asString(fallbackMessageId) ?? `${senderId}-${createdAt}`;
  const text = asString(source.text) ?? "";
  const type = asString(source.type) ?? "user";
  const clientMessageId = asString(source.clientMessageId) ?? asString(fallbackMessageId);
  const deliveredAt =
    typeof source.deliveredAt === "number" && Number.isFinite(source.deliveredAt)
      ? source.deliveredAt
      : nowMs();
  const readAt =
    typeof source.readAt === "number" && Number.isFinite(source.readAt) ? source.readAt : undefined;

  return {
    ...source,
    id,
    clientMessageId,
    user: senderName,
    senderId,
    text,
    type,
    createdAt,
    deliveredAt,
    readAt,
  };
}

function toConversationLastMessage(message) {
  const messageRecord = safeObject(message);
  const createdAtMs = typeof messageRecord.createdAt === "number" ? messageRecord.createdAt : nowMs();
  const deliveredAt =
    typeof messageRecord.deliveredAt === "number" && Number.isFinite(messageRecord.deliveredAt)
      ? messageRecord.deliveredAt
      : undefined;
  const readAt =
    typeof messageRecord.readAt === "number" && Number.isFinite(messageRecord.readAt)
      ? messageRecord.readAt
      : undefined;

  return {
    id: asString(messageRecord.id) ?? `${createdAtMs}`,
    senderId: asString(messageRecord.senderId) ?? "",
    text: asString(messageRecord.text) ?? "",
    createdAt: new Date(createdAtMs).toISOString(),
    deliveredAt,
    readAt,
  };
}

async function initializeDatabase() {
  await pool.query(`create extension if not exists pgcrypto`);

  const statements = [
    `
      create table if not exists social_user_items (
        user_id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists account_state_items (
        user_id text primary key,
        state jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists admin_wallet_credit_transactions (
        id uuid primary key default gen_random_uuid(),
        admin_user_id text not null,
        target_user_id text not null,
        delta_gems integer not null default 0 check (delta_gems >= 0),
        delta_cash integer not null default 0 check (delta_cash >= 0),
        delta_fuel integer not null default 0 check (delta_fuel >= 0),
        reason text not null default '',
        balance_before jsonb not null default '{}'::jsonb,
        balance_after jsonb not null default '{}'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `,
    `create index if not exists idx_admin_wallet_credit_target_created_at on admin_wallet_credit_transactions (target_user_id, created_at desc)`,
    `create index if not exists idx_admin_wallet_credit_admin_created_at on admin_wallet_credit_transactions (admin_user_id, created_at desc)`,
    `alter table if exists admin_wallet_credit_transactions drop constraint if exists admin_wallet_credit_transactions_delta_gems_check`,
    `alter table if exists admin_wallet_credit_transactions drop constraint if exists admin_wallet_credit_transactions_delta_cash_check`,
    `alter table if exists admin_wallet_credit_transactions drop constraint if exists admin_wallet_credit_transactions_delta_fuel_check`,
    `alter table if exists admin_wallet_credit_transactions add column if not exists transaction_type text not null default 'credit'`,
    `alter table if exists admin_wallet_credit_transactions add column if not exists reversal_of_transaction_id uuid`,
    `create index if not exists idx_admin_wallet_credit_reversal_of_transaction_id on admin_wallet_credit_transactions (reversal_of_transaction_id)`,
    `create unique index if not exists idx_admin_wallet_credit_single_reversal on admin_wallet_credit_transactions (reversal_of_transaction_id) where reversal_of_transaction_id is not null`,
    `
      create table if not exists admin_withdrawal_workflows (
        request_id text primary key,
        user_id text not null,
        status text not null default 'pending',
        decision_reason text not null default '',
        notes jsonb not null default '[]'::jsonb,
        status_history jsonb not null default '[]'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    `create index if not exists idx_admin_withdrawal_workflows_status_updated_at on admin_withdrawal_workflows (status, updated_at desc)`,
    `
      create table if not exists user_profile_items (
        user_id text primary key,
        profile jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists friendships (
        pair_key text primary key,
        user_low_id text not null,
        user_high_id text not null,
        status text not null check (status in ('pending', 'accepted', 'declined', 'blocked')),
        requested_by text,
        updated_at bigint not null
      )
    `,
    `create index if not exists idx_friendships_user_low on friendships (user_low_id)`,
    `create index if not exists idx_friendships_user_high on friendships (user_high_id)`,
    `
      create table if not exists conversation_items (
        owner_user_id text not null,
        other_user_id text not null,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        primary key (owner_user_id, other_user_id)
      )
    `,
    `create index if not exists idx_conversation_owner on conversation_items (owner_user_id)`,
    `
      create table if not exists thread_seed_messages (
        owner_user_id text not null,
        other_user_id text not null,
        messages jsonb not null default '[]'::jsonb,
        updated_at timestamptz not null default now(),
        primary key (owner_user_id, other_user_id)
      )
    `,
    `create index if not exists idx_thread_owner on thread_seed_messages (owner_user_id)`,
    `
      create table if not exists global_message_items (
        id text primary key,
        room_id text,
        item jsonb not null default '{}'::jsonb,
        created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
      )
    `,
    `create index if not exists idx_global_room_created on global_message_items (room_id, created_at)`,
    `
      create table if not exists mention_user_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists notification_items (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        item jsonb not null default '{}'::jsonb,
        created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
      )
    `,
    `create index if not exists idx_notification_user on notification_items (user_id)`,
    `
      create table if not exists live_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists live_boost_leaderboard_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists known_live_user_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists live_presence_items (
        user_id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists leaderboard_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists video_items (
        id text primary key,
        item jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists support_tickets (
        id uuid primary key default gen_random_uuid(),
        user_id text not null,
        category text not null default 'general',
        priority text not null default 'normal',
        status text not null default 'open',
        assignee_admin_id text,
        notes jsonb not null default '[]'::jsonb,
        status_history jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists moderation_reports (
        id text primary key,
        scope text not null default 'global',
        message_id text,
        reported_user_id text,
        context_key text,
        status text not null default 'open',
        reason text not null default '',
        payload jsonb not null default '{}'::jsonb,
        linked_ticket_id uuid references support_tickets(id) on delete set null,
        escalated_at timestamptz,
        escalated_by_admin_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `,
    `create index if not exists idx_moderation_reports_message_id on moderation_reports (message_id)`,
    `create index if not exists idx_moderation_reports_status on moderation_reports (status, created_at desc)`,
    `
      create table if not exists moderation_actions (
        id text primary key default gen_random_uuid()::text,
        admin_user_id text not null,
        target_type text not null,
        target_id text not null,
        action_type text not null,
        reason text not null default '',
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `,
    `create index if not exists idx_moderation_actions_created_at on moderation_actions (created_at desc)`,
    `create index if not exists idx_moderation_actions_admin_created_at on moderation_actions (admin_user_id, created_at desc)`,
    `
      create table if not exists admin_exports (
        id text primary key default gen_random_uuid()::text,
        admin_user_id text not null,
        resource_type text not null,
        export_format text not null,
        filters jsonb not null default '{}'::jsonb,
        estimated_count integer not null default 0,
        row_count integer,
        status text not null default 'queued',
        progress integer not null default 0,
        file_name text,
        content_type text,
        file_body text,
        error_message text,
        download_token text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz
      )
    `,
    `create index if not exists idx_admin_exports_admin_created_at on admin_exports (admin_user_id, created_at desc)`,
    `create index if not exists idx_admin_exports_status_created_at on admin_exports (status, created_at desc)`,
    `
      create table if not exists artists (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        image_url text,
        created_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists tracks (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        artist_id uuid references artists(id) on delete set null,
        artwork_url text,
        duration_seconds integer not null default 0,
        audio_url text,
        created_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists playlists (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        description text,
        cover_url text,
        created_at timestamptz not null default now()
      )
    `,
    `
      create table if not exists playlist_tracks (
        playlist_id uuid not null references playlists(id) on delete cascade,
        track_id uuid not null references tracks(id) on delete cascade,
        position integer not null default 0,
        primary key (playlist_id, track_id)
      )
    `,
    `create index if not exists idx_tracks_artist on tracks (artist_id)`,
    `create index if not exists idx_tracks_created_at on tracks (created_at desc)`,
    `create index if not exists idx_playlists_created_at on playlists (created_at desc)`,
    `create index if not exists idx_playlist_tracks_playlist_position on playlist_tracks (playlist_id, position)`,
    `
      create table if not exists audit_logs (
        id uuid primary key default gen_random_uuid(),
        ts timestamptz not null default now(),
        actor_admin_id text not null,
        actor_role text not null default 'admin',
        action_type text not null,
        target_type text not null,
        target_id text not null default '',
        reason text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        result text not null default 'success',
        error_message text
      )
    `,
    `create index if not exists idx_audit_logs_ts on audit_logs (ts desc)`,
    `create index if not exists idx_audit_logs_actor_ts on audit_logs (actor_admin_id, ts desc)`,
    `create index if not exists idx_audit_logs_target_ts on audit_logs (target_id, ts desc)`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureAuditLogSchema();

  await ensureMusicSeedData();
}

async function ensureAuditLogSchema() {
  const statements = [
    `alter table audit_logs add column if not exists admin_user_id text`,
    `alter table audit_logs add column if not exists created_at timestamptz`,
    `alter table audit_logs add column if not exists payload jsonb`,
    `alter table audit_logs add column if not exists ts timestamptz`,
    `alter table audit_logs add column if not exists actor_admin_id text`,
    `alter table audit_logs add column if not exists actor_role text`,
    `alter table audit_logs add column if not exists metadata jsonb`,
    `alter table audit_logs add column if not exists result text`,
    `alter table audit_logs add column if not exists error_message text`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }

  await pool.query(`
    update audit_logs
    set
      ts = coalesce(ts, created_at, now()),
      actor_admin_id = coalesce(nullif(actor_admin_id, ''), admin_user_id, 'unknown-admin'),
      actor_role = coalesce(nullif(actor_role, ''), 'admin'),
      metadata = coalesce(metadata, payload, '{}'::jsonb),
      result = case when lower(coalesce(result, '')) = 'fail' then 'fail' else 'success' end
  `);

  await pool.query(`alter table audit_logs alter column ts set default now()`);
  await pool.query(`alter table audit_logs alter column ts set not null`);
  await pool.query(`alter table audit_logs alter column actor_admin_id set default 'unknown-admin'`);
  await pool.query(`alter table audit_logs alter column actor_admin_id set not null`);
  await pool.query(`alter table audit_logs alter column actor_role set default 'admin'`);
  await pool.query(`alter table audit_logs alter column actor_role set not null`);
  await pool.query(`alter table audit_logs alter column metadata set default '{}'::jsonb`);
  await pool.query(`alter table audit_logs alter column metadata set not null`);
  await pool.query(`alter table audit_logs alter column result set default 'success'`);
  await pool.query(`alter table audit_logs alter column result set not null`);
  await pool.query(`
    alter table audit_logs
    add constraint audit_logs_result_check
    check (result in ('success', 'fail'))
    not valid
  `).catch((error) => {
    if (!String(error?.message ?? "").includes("already exists")) {
      throw error;
    }
  });
  await pool.query(`alter table audit_logs validate constraint audit_logs_result_check`);
}

async function ensureMusicSeedData() {
  const [trackCountResult, playlistCountResult] = await Promise.all([
    pool.query(`select count(*)::int as count from tracks`),
    pool.query(`select count(*)::int as count from playlists`),
  ]);

  const trackCount = Number(trackCountResult.rows[0]?.count ?? 0);
  const playlistCount = Number(playlistCountResult.rows[0]?.count ?? 0);

  if (trackCount > 0 || playlistCount > 0) {
    return;
  }

  const artistDefinitions = [
    {
      key: "vulu-wave",
      name: "Vulu Wave",
      imageUrl:
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80",
    },
    {
      key: "neon-district",
      name: "Neon District",
      imageUrl:
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
    },
    {
      key: "astra",
      name: "Astra",
      imageUrl:
        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80",
    },
  ];

  const artistIdByKey = new Map();
  for (const artist of artistDefinitions) {
    const insertArtistResult = await pool.query(
      `
        insert into artists (name, image_url)
        values ($1, $2)
        returning id::text as id
      `,
      [artist.name, artist.imageUrl],
    );
    const artistId = asString(insertArtistResult.rows[0]?.id);
    if (artistId) {
      artistIdByKey.set(artist.key, artistId);
    }
  }

  const trackDefinitions = [
    {
      key: "after-hours",
      title: "After Hours Signal",
      artistKey: "vulu-wave",
      artworkUrl:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 193,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    {
      key: "night-drive",
      title: "Night Drive Loop",
      artistKey: "neon-district",
      artworkUrl:
        "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 214,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
    {
      key: "run-it-up",
      title: "Run It Up",
      artistKey: "astra",
      artworkUrl:
        "https://images.unsplash.com/photo-1458560871784-56d23406c091?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 181,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
    {
      key: "city-glow",
      title: "City Glow",
      artistKey: "vulu-wave",
      artworkUrl:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 205,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    },
    {
      key: "diamond-sky",
      title: "Diamond Sky",
      artistKey: "astra",
      artworkUrl:
        "https://images.unsplash.com/photo-1434117185659-61e8d4c273c4?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 226,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    },
    {
      key: "ghost-frequency",
      title: "Ghost Frequency",
      artistKey: "neon-district",
      artworkUrl:
        "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=800&q=80",
      durationSeconds: 199,
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    },
  ];

  const trackIdByKey = new Map();
  for (const track of trackDefinitions) {
    const artistId = artistIdByKey.get(track.artistKey) ?? null;
    const insertTrackResult = await pool.query(
      `
        insert into tracks (title, artist_id, artwork_url, duration_seconds, audio_url)
        values ($1, $2, $3, $4, $5)
        returning id::text as id
      `,
      [track.title, artistId, track.artworkUrl, track.durationSeconds, track.audioUrl],
    );
    const trackId = asString(insertTrackResult.rows[0]?.id);
    if (trackId) {
      trackIdByKey.set(track.key, trackId);
    }
  }

  const playlistDefinitions = [
    {
      key: "trending-now",
      title: "Trending Now",
      description: "Most played tracks on Vulu right now.",
      coverUrl:
        "https://images.unsplash.com/photo-1464375117522-1311dd7d98d9?auto=format&fit=crop&w=800&q=80",
      trackKeys: ["after-hours", "night-drive", "run-it-up"],
    },
    {
      key: "late-night",
      title: "Late Night Energy",
      description: "For gaming sessions after midnight.",
      coverUrl:
        "https://images.unsplash.com/photo-1513883049090-d0b7439799bf?auto=format&fit=crop&w=800&q=80",
      trackKeys: ["city-glow", "ghost-frequency", "diamond-sky"],
    },
  ];

  for (const playlist of playlistDefinitions) {
    const insertPlaylistResult = await pool.query(
      `
        insert into playlists (title, description, cover_url)
        values ($1, $2, $3)
        returning id::text as id
      `,
      [playlist.title, playlist.description, playlist.coverUrl],
    );
    const playlistId = asString(insertPlaylistResult.rows[0]?.id);
    if (!playlistId) continue;

    for (let index = 0; index < playlist.trackKeys.length; index += 1) {
      const trackKey = playlist.trackKeys[index];
      const trackId = trackIdByKey.get(trackKey);
      if (!trackId) continue;

      await pool.query(
        `
          insert into playlist_tracks (playlist_id, track_id, position)
          values ($1::uuid, $2::uuid, $3)
          on conflict (playlist_id, track_id)
          do update set position = excluded.position
        `,
        [playlistId, trackId, index],
      );
    }
  }

  console.log("[music] Seeded default artists, tracks, and playlists");
}

function extractRoleCandidate(value) {
  if (typeof value === "string") {
    return asString(value);
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const entry of value) {
    const candidate = asString(entry);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function extractRoleFromStoredUserPayload(payload) {
  const claims = safeObject(payload);
  const directRole =
    extractRoleCandidate(claims.role) ??
    extractRoleCandidate(claims.org_role) ??
    extractRoleCandidate(claims.orgRole);
  if (directRole) {
    return directRole;
  }

  const metadataCandidates = [
    claims.public_metadata,
    claims.publicMetadata,
    claims.private_metadata,
    claims.privateMetadata,
    claims.metadata,
    claims.org_metadata,
    claims.orgMetadata,
    safeObject(claims.organization).public_metadata,
    safeObject(claims.organization).publicMetadata,
    safeObject(claims.organization).private_metadata,
    safeObject(claims.organization).privateMetadata,
  ];

  for (const metadataCandidate of metadataCandidates) {
    const metadata = safeObject(metadataCandidate);
    const metadataRole =
      extractRoleCandidate(metadata.role) ??
      extractRoleCandidate(metadata.org_role) ??
      extractRoleCandidate(metadata.orgRole);
    if (metadataRole) {
      return metadataRole;
    }
  }

  return undefined;
}

async function resolveAuthFromToken(token) {
  const normalizedToken = asString(token);
  if (!normalizedToken || !jwks) return null;

  try {
    const { payload } = await jwtVerify(normalizedToken, jwks, jwtVerifyOptions);
    const userId = asString(payload.sub);
    if (!userId) return null;
    return {
      userId,
      payload,
    };
  } catch {
    return null;
  }
}

async function resolveUserIdFromToken(token) {
  const authResult = await resolveAuthFromToken(token);
  return authResult?.userId ?? null;
}

async function resolveViewerUserId(req) {
  const fallbackUserId =
    !jwks || allowInsecureUserIdHeaderAuth ? asString(req.header("x-vulu-user-id")) : null;
  if (fallbackUserId) return fallbackUserId;

  const authHeader = asString(req.header("authorization"));
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return resolveUserIdFromToken(token);
}

async function requireAuth(req, res, next) {
  const viewerUserId = await resolveViewerUserId(req);
  if (!viewerUserId) {
    res.status(401).json({
      error: "Unauthenticated",
    });
    return;
  }

  req.viewerUserId = viewerUserId;
  next();
}

function normalizeRoleValue(value) {
  return (asString(value) ?? "").toLowerCase();
}

const ADMIN_PERMISSIONS = {
  VIEW_DMS: "VIEW_DMS",
  MANAGE_USERS: "MANAGE_USERS",
  MODERATE_GLOBAL_CHAT: "MODERATE_GLOBAL_CHAT",
  GRANT_CURRENCY: "GRANT_CURRENCY",
  VIEW_USERS: "VIEW_USERS",
  VIEW_SYSTEM_HEALTH: "VIEW_SYSTEM_HEALTH",
  VIEW_INCIDENT_CENTER: "VIEW_INCIDENT_CENTER",
  VIEW_MESSAGE_LOGS: "VIEW_MESSAGE_LOGS",
  BAN_USER: "BAN_USER",
  MUTE_USER: "MUTE_USER",
  MODERATE_MESSAGES: "MODERATE_MESSAGES",
  CHANGE_USER_ROLE: "CHANGE_USER_ROLE",
  VIEW_SUPPORT_TICKETS: "VIEW_SUPPORT_TICKETS",
  RESOLVE_TICKET: "RESOLVE_TICKET",
  ADD_TICKET_NOTE: "ADD_TICKET_NOTE",
  ASSIGN_TICKET: "ASSIGN_TICKET",
  BULK_RESOLVE_TICKETS: "BULK_RESOLVE_TICKETS",
  BULK_ASSIGN_TICKETS: "BULK_ASSIGN_TICKETS",
  SET_TICKET_PRIORITY: "SET_TICKET_PRIORITY",
  EDIT_WALLET: "EDIT_WALLET",
  BROADCAST_ALERT: "BROADCAST_ALERT",
  EDIT_EVENT_CONFIG: "EDIT_EVENT_CONFIG",
  UNPUBLISH_CONTENT: "UNPUBLISH_CONTENT",
  TRIGGER_SNAPSHOT: "TRIGGER_SNAPSHOT",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
  MANAGE_SYSTEM: "MANAGE_SYSTEM",
  EXPORT_DATA: ADMIN_EXPORT_PERMISSION,
};

const ADMIN_ROLE_ORDER = ["SUPPORT", "MODERATOR", "ADMIN", "OWNER"];
const ADMIN_ROLE_RANK = ADMIN_ROLE_ORDER.reduce((accumulator, role, index) => {
  accumulator[role] = index;
  return accumulator;
}, {});

const ADMIN_ROLE_PERMISSIONS = {
  OWNER: new Set(Object.values(ADMIN_PERMISSIONS)),
  ADMIN: new Set([
    ADMIN_PERMISSIONS.VIEW_DMS,
    ADMIN_PERMISSIONS.MANAGE_USERS,
    ADMIN_PERMISSIONS.MODERATE_GLOBAL_CHAT,
    ADMIN_PERMISSIONS.GRANT_CURRENCY,
    ADMIN_PERMISSIONS.VIEW_USERS,
    ADMIN_PERMISSIONS.VIEW_SYSTEM_HEALTH,
    ADMIN_PERMISSIONS.VIEW_INCIDENT_CENTER,
    ADMIN_PERMISSIONS.VIEW_MESSAGE_LOGS,
    ADMIN_PERMISSIONS.BAN_USER,
    ADMIN_PERMISSIONS.MUTE_USER,
    ADMIN_PERMISSIONS.MODERATE_MESSAGES,
    ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS,
    ADMIN_PERMISSIONS.RESOLVE_TICKET,
    ADMIN_PERMISSIONS.ADD_TICKET_NOTE,
    ADMIN_PERMISSIONS.ASSIGN_TICKET,
    ADMIN_PERMISSIONS.BULK_RESOLVE_TICKETS,
    ADMIN_PERMISSIONS.BULK_ASSIGN_TICKETS,
    ADMIN_PERMISSIONS.SET_TICKET_PRIORITY,
    ADMIN_PERMISSIONS.EDIT_WALLET,
    ADMIN_PERMISSIONS.BROADCAST_ALERT,
    ADMIN_PERMISSIONS.EDIT_EVENT_CONFIG,
    ADMIN_PERMISSIONS.UNPUBLISH_CONTENT,
    ADMIN_PERMISSIONS.TRIGGER_SNAPSHOT,
    ADMIN_PERMISSIONS.VIEW_AUDIT_LOGS,
  ]),
  MODERATOR: new Set([
    ADMIN_PERMISSIONS.MANAGE_USERS,
    ADMIN_PERMISSIONS.MODERATE_GLOBAL_CHAT,
    ADMIN_PERMISSIONS.VIEW_USERS,
    ADMIN_PERMISSIONS.VIEW_INCIDENT_CENTER,
    ADMIN_PERMISSIONS.VIEW_MESSAGE_LOGS,
    ADMIN_PERMISSIONS.BAN_USER,
    ADMIN_PERMISSIONS.MUTE_USER,
    ADMIN_PERMISSIONS.MODERATE_MESSAGES,
    ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS,
    ADMIN_PERMISSIONS.RESOLVE_TICKET,
    ADMIN_PERMISSIONS.ADD_TICKET_NOTE,
    ADMIN_PERMISSIONS.ASSIGN_TICKET,
    ADMIN_PERMISSIONS.BULK_RESOLVE_TICKETS,
    ADMIN_PERMISSIONS.BULK_ASSIGN_TICKETS,
  ]),
  SUPPORT: new Set([
    ADMIN_PERMISSIONS.VIEW_USERS,
    ADMIN_PERMISSIONS.VIEW_INCIDENT_CENTER,
    ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS,
    ADMIN_PERMISSIONS.RESOLVE_TICKET,
    ADMIN_PERMISSIONS.ADD_TICKET_NOTE,
    ADMIN_PERMISSIONS.ASSIGN_TICKET,
  ]),
};

function normalizeAdminRole(role) {
  const normalizedRole = normalizeRoleValue(role);
  if (!normalizedRole) {
    return "USER";
  }
  if (normalizedRole === "owner" || normalizedRole === "superadmin" || normalizedRole === "super_admin") {
    return "OWNER";
  }
  if (normalizedRole === "mod" || /(^|[:_])mod$/.test(normalizedRole)) {
    return "MODERATOR";
  }
  if (normalizedRole === "moderator" || /(^|[:_])moderator$/.test(normalizedRole)) {
    return "MODERATOR";
  }
  if (normalizedRole === "support" || /(^|[:_])support$/.test(normalizedRole)) {
    return "SUPPORT";
  }
  if (normalizedRole === "admin" || /(^|[:_])admin$/.test(normalizedRole)) {
    return "ADMIN";
  }
  return "USER";
}

function getAdminPermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[normalizeAdminRole(role)] ?? new Set();
}

function hasAdminPermission(role, permission) {
  return getAdminPermissions(role).has(permission);
}

function serializeAdminPermissions(role) {
  return {
    canViewDms: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_DMS),
    canManageUsers:
      hasAdminPermission(role, ADMIN_PERMISSIONS.BAN_USER) ||
      hasAdminPermission(role, ADMIN_PERMISSIONS.MUTE_USER) ||
      hasAdminPermission(role, ADMIN_PERMISSIONS.CHANGE_USER_ROLE),
    canModerateGlobalChat: hasAdminPermission(role, ADMIN_PERMISSIONS.MODERATE_MESSAGES),
    canGrantCurrency: hasAdminPermission(role, ADMIN_PERMISSIONS.EDIT_WALLET),
    canViewUsers: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_USERS),
    canViewSystemHealth: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_SYSTEM_HEALTH),
    canViewIncidentCenter: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_INCIDENT_CENTER),
    canViewMessageLogs: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_MESSAGE_LOGS),
    canBanUser: hasAdminPermission(role, ADMIN_PERMISSIONS.BAN_USER),
    canMuteUser: hasAdminPermission(role, ADMIN_PERMISSIONS.MUTE_USER),
    canModerateMessages: hasAdminPermission(role, ADMIN_PERMISSIONS.MODERATE_MESSAGES),
    canChangeUserRole: hasAdminPermission(role, ADMIN_PERMISSIONS.CHANGE_USER_ROLE),
    canViewSupportTickets: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS),
    canResolveTicket: hasAdminPermission(role, ADMIN_PERMISSIONS.RESOLVE_TICKET),
    canAddTicketNote: hasAdminPermission(role, ADMIN_PERMISSIONS.ADD_TICKET_NOTE),
    canAssignTicket: hasAdminPermission(role, ADMIN_PERMISSIONS.ASSIGN_TICKET),
    canSetTicketPriority: hasAdminPermission(role, ADMIN_PERMISSIONS.SET_TICKET_PRIORITY),
    canEditWallet: hasAdminPermission(role, ADMIN_PERMISSIONS.EDIT_WALLET),
    canBroadcastAlert: hasAdminPermission(role, ADMIN_PERMISSIONS.BROADCAST_ALERT),
    canTriggerSnapshot: hasAdminPermission(role, ADMIN_PERMISSIONS.TRIGGER_SNAPSHOT),
    canViewAuditLogs: hasAdminPermission(role, ADMIN_PERMISSIONS.VIEW_AUDIT_LOGS),
    canManageSystem: hasAdminPermission(role, ADMIN_PERMISSIONS.MANAGE_SYSTEM),
    canExportData: hasAdminPermission(role, ADMIN_PERMISSIONS.EXPORT_DATA),
  };
}

function hasAdminPrivileges(role) {
  const normalizedRole = normalizeAdminRole(role);
  return normalizedRole === "ADMIN" || normalizedRole === "OWNER";
}

function hasAdminAccessRole(role) {
  return normalizeAdminRole(role) !== "USER";
}

async function resolveStoredUserRole(userId) {
  const roleResult = await pool.query(
    `
      select coalesce(
        account.state->>'role',
        account.state->'publicMetadata'->>'role',
        account.state->'public_metadata'->>'role',
        profile.profile->>'role',
        profile.profile->'publicMetadata'->>'role',
        profile.profile->'public_metadata'->>'role',
        'user'
      ) as role
      from (select $1::text as user_id) seed
      left join account_state_items account on account.user_id = seed.user_id
      left join user_profile_items profile on profile.user_id = seed.user_id
      limit 1
    `,
    [userId],
  );
  return asString(roleResult.rows[0]?.role) ?? "user";
}

async function ensureAuthenticatedRequest(req, res) {
  if (req.viewerUserId) {
    return true;
  }

  let authenticated = false;
  await requireAuth(req, res, (error) => {
    if (error) {
      throw error;
    }
    authenticated = true;
  });

  return authenticated && !!req.viewerUserId;
}

function requireAdminPermission(permission) {
  return asyncRoute(async (req, res, next) => {
    const authenticated = await ensureAuthenticatedRequest(req, res);
    if (!authenticated) {
      return;
    }

    const adminRole = await resolveStoredUserRole(req.viewerUserId);
    const normalizedRole = normalizeAdminRole(adminRole);
    if (!hasAdminPermission(normalizedRole, permission)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    req.viewerRole = normalizedRole;
    next();
  });
}

function parseOptionalIsoDate(value) {
  const rawValue = asString(value).trim();
  if (!rawValue) {
    return null;
  }

  const parsedValue = Date.parse(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return new Date(parsedValue).toISOString();
}

async function insertAuditLogEntry({
  adminUserId,
  adminRole,
  actionType,
  targetType,
  targetId,
  reason,
  payload,
  result = "success",
  errorMessage = null,
}) {
  const actorAdminId = asString(adminUserId).trim() || "unknown-admin";
  const actorRole = normalizeAdminRole(adminRole).toLowerCase();
  const normalizedActionType = asString(actionType).trim();
  const normalizedTargetType = asString(targetType).trim();
  const normalizedTargetId = asString(targetId).trim();

  if (!normalizedActionType || !normalizedTargetType) {
    return;
  }

  const metadata = safeObject(payload);

  await pool.query(
    `
      insert into audit_logs (
        admin_user_id,
        created_at,
        payload,
        ts,
        actor_admin_id,
        actor_role,
        action_type,
        target_type,
        target_id,
        reason,
        metadata,
        result,
        error_message
      )
      values ($1, now(), $2, now(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      actorAdminId,
      metadata,
      actorAdminId,
      actorRole || "admin",
      normalizedActionType,
      normalizedTargetType,
      normalizedTargetId,
      asString(reason),
      metadata,
      asString(result).trim().toLowerCase() === "fail" ? "fail" : "success",
      asString(errorMessage) || null,
    ],
  );
}

async function insertModerationActionEntry({
  adminUserId,
  targetType,
  targetId,
  actionType,
  reason,
  payload,
}) {
  await pool.query(
    `
      insert into moderation_actions (
        admin_user_id,
        target_type,
        target_id,
        action_type,
        reason,
        payload
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      asString(adminUserId).trim(),
      asString(targetType).trim(),
      asString(targetId).trim(),
      asString(actionType).trim(),
      asString(reason),
      safeObject(payload),
    ],
  );
}

function normalizeAdminExportResource(value) {
  const normalizedValue = asString(value).trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(EXPORTABLE_ADMIN_DATASETS, normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

function normalizeAdminExportFormat(value) {
  const normalizedValue = asString(value).trim().toLowerCase();
  if (normalizedValue === "json") {
    return "json";
  }
  if (normalizedValue === "csv") {
    return "csv";
  }
  return null;
}

function sanitizeAdminExportFilters(resource, rawFilters) {
  const config = EXPORTABLE_ADMIN_DATASETS[resource];
  const input = safeObject(rawFilters);
  const filters = {};

  for (const filterKey of Object.keys(config.filterColumns)) {
    const filterValue = asString(input[filterKey]).trim();
    if (filterValue) {
      filters[filterKey] = filterValue;
    }
  }

  const startDate = parseOptionalIsoDate(
    input.startDate ?? input.createdFrom ?? input.from,
  );
  const endDate = parseOptionalIsoDate(
    input.endDate ?? input.createdTo ?? input.to,
  );

  if (startDate) {
    filters.startDate = startDate;
  }
  if (endDate) {
    filters.endDate = endDate;
  }

  return filters;
}

function buildAdminExportQuery(resource, filters, { countOnly = false } = {}) {
  const config = EXPORTABLE_ADMIN_DATASETS[resource];
  const values = [];
  const clauses = [];

  for (const [filterKey, columnName] of Object.entries(config.filterColumns)) {
    const filterValue = asString(filters?.[filterKey]).trim();
    if (!filterValue) {
      continue;
    }

    values.push(filterValue);
    clauses.push(`lower(${columnName}) = lower($${values.length})`);
  }

  if (filters?.startDate) {
    values.push(filters.startDate);
    clauses.push(`${config.createdAtColumn} >= $${values.length}`);
  }

  if (filters?.endDate) {
    values.push(filters.endDate);
    clauses.push(`${config.createdAtColumn} <= $${values.length}`);
  }

  const whereSql = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
  const selectSql = countOnly
    ? `select count(*)::int as count from ${config.tableName}`
    : `select * from ${config.tableName}`;
  const orderSql = countOnly ? "" : ` order by ${config.createdAtColumn} desc`;

  return {
    sql: `${selectSql} ${whereSql}${orderSql}`,
    values,
  };
}

async function countAdminExportRows(resource, filters) {
  const query = buildAdminExportQuery(resource, filters, { countOnly: true });
  const result = await pool.query(query.sql, query.values);
  return Number(result.rows[0]?.count ?? 0);
}

async function fetchAdminExportRows(resource, filters) {
  const query = buildAdminExportQuery(resource, filters);
  const result = await pool.query(query.sql, query.values);
  return result.rows;
}

function serializeAdminExportCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return asString(value);
}

function escapeCsvValue(value) {
  const serializedValue = serializeAdminExportCell(value);
  if (!/[",\n]/.test(serializedValue)) {
    return serializedValue;
  }
  return `"${serializedValue.replace(/"/g, '""')}"`;
}

function buildCsvExportContent(columns, rows) {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((columnName) => escapeCsvValue(row?.[columnName])).join(","),
  );
  return [header, ...lines].join("\n");
}

function getAdminExportMimeType(format) {
  return format === "json"
    ? "application/json; charset=utf-8"
    : "text/csv; charset=utf-8";
}

function buildAdminExportFileName(resource, format) {
  const config = EXPORTABLE_ADMIN_DATASETS[resource];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${config.filePrefix}-${timestamp}.${format}`;
}

function safeTextCompare(left, right) {
  const leftValue = asString(left);
  const rightValue = asString(right);
  if (!leftValue || !rightValue || leftValue.length !== rightValue.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(leftValue), Buffer.from(rightValue));
}

function buildAbsoluteUrl(req, path) {
  const host = asString(req.get("host")).trim();
  if (!host) {
    return path;
  }
  return `${req.protocol}://${host}${path}`;
}

function serializeAdminExportRecord(row, req) {
  const exportId = asString(row?.id).trim();
  const downloadToken = asString(row?.download_token).trim();
  const status = asString(row?.status).trim() || "queued";
  const progress = Number.parseInt(asString(row?.progress), 10);

  return {
    id: exportId,
    adminUserId: asString(row?.admin_user_id),
    resourceType: normalizeAdminExportResource(row?.resource_type),
    exportFormat: normalizeAdminExportFormat(row?.export_format),
    status,
    progress: Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 100) : 0,
    estimatedCount: Number(row?.estimated_count ?? 0),
    rowCount: row?.row_count == null ? null : Number(row.row_count),
    fileName: asString(row?.file_name) || null,
    contentType: asString(row?.content_type) || null,
    filters: safeObject(row?.filters),
    errorMessage: asString(row?.error_message) || null,
    createdAt: row?.created_at
      ? new Date(row.created_at).toISOString()
      : null,
    completedAt: row?.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    downloadUrl:
      status === "completed" && exportId && downloadToken
        ? buildAbsoluteUrl(
          req,
          `/admin/exports/${encodeURIComponent(exportId)}/download?token=${encodeURIComponent(downloadToken)}`,
        )
        : null,
  };
}

async function processAdminExportJob(exportId) {
  const exportResult = await pool.query(
    `select * from admin_exports where id = $1 limit 1`,
    [exportId],
  );
  const exportRow = exportResult.rows[0];
  if (!exportRow) {
    return;
  }

  const resource = normalizeAdminExportResource(exportRow.resource_type);
  const format = normalizeAdminExportFormat(exportRow.export_format);
  if (!resource || !format) {
    await pool.query(
      `
        update admin_exports
        set status = 'failed',
            progress = 100,
            error_message = $2,
            updated_at = now()
        where id = $1
      `,
      [exportId, "Invalid export configuration."],
    );
    return;
  }

  try {
    await pool.query(
      `
        update admin_exports
        set status = 'processing',
            progress = 45,
            updated_at = now()
        where id = $1
      `,
      [exportId],
    );

    const filters = safeObject(exportRow.filters);
    const rows = await fetchAdminExportRows(resource, filters);
    const config = EXPORTABLE_ADMIN_DATASETS[resource];
    const fileBody = format === "json"
      ? `${JSON.stringify(rows, null, 2)}\n`
      : buildCsvExportContent(config.columns, rows);

    await pool.query(
      `
        update admin_exports
        set status = 'completed',
            progress = 100,
            row_count = $2,
            file_name = $3,
            content_type = $4,
            file_body = $5,
            error_message = null,
            updated_at = now(),
            completed_at = now()
        where id = $1
      `,
      [
        exportId,
        rows.length,
        buildAdminExportFileName(resource, format),
        getAdminExportMimeType(format),
        fileBody,
      ],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    await pool.query(
      `
        update admin_exports
        set status = 'failed',
            progress = 100,
            error_message = $2,
            updated_at = now()
        where id = $1
      `,
      [exportId, message],
    );
  }
}

function parseWalletCreditAmount(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  if (parsed > MAX_ADMIN_WALLET_CREDIT_AMOUNT) {
    throw new Error(
      `${fieldName} exceeds the maximum allowed amount (${MAX_ADMIN_WALLET_CREDIT_AMOUNT}).`,
    );
  }
  return parsed;
}

function parseAdminWalletAdjustmentAmount(value, { allowZero = false } = {}) {
  if (value === undefined || value === null || value === "") {
    throw new Error("amount is required.");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error("amount must be a whole number.");
  }
  if (parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error(allowZero ? "amount must be 0 or greater." : "amount must be greater than 0.");
  }
  if (parsed > MAX_ADMIN_WALLET_CREDIT_AMOUNT) {
    throw new Error(
      `amount exceeds the maximum allowed amount (${MAX_ADMIN_WALLET_CREDIT_AMOUNT}).`,
    );
  }
  return parsed;
}

function normalizeAdminWalletCurrency(value) {
  const normalized = asString(value)?.trim().toLowerCase();
  if (!normalized) {
    throw new Error("currency is required.");
  }
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(normalized)) {
    throw new Error(
      "currency must start with a letter and only contain letters, numbers, dashes, or underscores.",
    );
  }
  return normalized;
}

function normalizeAdminWalletOperation(value) {
  const normalized = asString(value)?.trim().toLowerCase();
  if (
    normalized !== "credit" &&
    normalized !== "debit" &&
    normalized !== "set" &&
    normalized !== "reversal"
  ) {
    throw new Error("operation must be credit, debit, set, or reversal.");
  }
  return normalized;
}

function normalizeManagedWalletCurrency(value) {
  const normalized = normalizeAdminWalletCurrency(value);
  if (normalized !== "gems" && normalized !== "cash" && normalized !== "fuel") {
    throw new Error("currency must be gems, cash, or fuel.");
  }
  return normalized;
}

function buildAdminRequestMetadata(req, extra = {}) {
  return {
    ip: asString(req.header("x-forwarded-for")) ?? asString(req.ip) ?? null,
    userAgent: asString(req.header("user-agent")) ?? null,
    source: asString(req.body?.source) ?? "admin_console",
    ...safeObject(extra),
  };
}

function toWalletSnapshot(value) {
  const wallet = safeObject(value);
  return {
    gems: toWalletBalance(wallet.gems),
    cash: toWalletBalance(wallet.cash),
    fuel: toWalletBalance(wallet.fuel),
  };
}

function emptyWalletDelta() {
  return {
    gems: 0,
    cash: 0,
    fuel: 0,
  };
}

function hasWalletDelta(delta) {
  return delta.gems !== 0 || delta.cash !== 0 || delta.fuel !== 0;
}

function getWalletDeltaFromTransactionRow(row) {
  return {
    gems: Number(row?.delta_gems ?? 0) || 0,
    cash: Number(row?.delta_cash ?? 0) || 0,
    fuel: Number(row?.delta_fuel ?? 0) || 0,
  };
}

function normalizeAdminWalletReason(value) {
  const reason = asString(value)?.trim().slice(0, MAX_ADMIN_WALLET_CREDIT_REASON_LENGTH) ?? "";
  if (!reason) {
    throw new Error("reason is required.");
  }
  return reason;
}

function normalizeWithdrawalWorkflowStatus(value, fallback = "pending") {
  const normalized = asString(value)?.trim().toLowerCase();
  if (normalized === "declined") {
    return "denied";
  }
  if (normalized && ADMIN_WITHDRAWAL_WORKFLOW_STATUSES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function toWalletBalance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

async function requireAdmin(req, res, next) {
  const adminViewer = await authenticateAdminViewer(req, res);
  if (!adminViewer) {
    return;
  }

  if (!hasAdminPrivileges(adminViewer.effectiveRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  req.viewerUserId = adminViewer.userId;
  req.viewerRole = adminViewer.effectiveRole;
  next();
}

async function authenticateAdminViewer(req, res) {
  if (!jwks) {
    res.status(503).json({
      error: "Admin auth is unavailable because AUTH_JWKS_URL is not configured.",
    });
    return null;
  }

  const authHeader = asString(req.header("authorization"));
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Unauthenticated" });
    return null;
  }

  const token = authHeader.slice(7).trim();
  const authResult = await resolveAuthFromToken(token);
  if (!authResult?.userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return null;
  }

  const tokenRole = extractRoleFromStoredUserPayload(authResult.payload);
  const storedRole = await resolveStoredUserRole(authResult.userId);
  const effectiveRole = tokenRole ?? storedRole;

  if (!hasAdminAccessRole(effectiveRole)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return {
    userId: authResult.userId,
    effectiveRole,
  };
}

function requireAdminRole(allowedRoles = []) {
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles
        .map((role) => normalizeAdminRole(role))
        .filter((role) => role !== "USER")
    : [];

  return async (req, res, next) => {
    try {
      const adminViewer = await authenticateAdminViewer(req, res);
      if (!adminViewer) {
        return;
      }

      const normalizedViewerRole = normalizeAdminRole(adminViewer.effectiveRole);
      const viewerRoleRank = ADMIN_ROLE_RANK[normalizedViewerRole] ?? -1;
      const roleIsAllowed =
        normalizedAllowedRoles.length === 0 ||
        normalizedAllowedRoles.some((allowedRole) => viewerRoleRank >= (ADMIN_ROLE_RANK[allowedRole] ?? Infinity));

      if (!roleIsAllowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      req.viewerUserId = adminViewer.userId;
      req.viewerRole = normalizedViewerRole;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function normalizeModerationScope(value, fallback = "all") {
  const normalized = asString(value).toLowerCase();
  if (normalized === "global" || normalized === "dm" || normalized === "all") {
    return normalized;
  }
  return fallback;
}

function normalizeFlaggedStateFilter(value) {
  const normalized = asString(value).toLowerCase();
  if (normalized === "flagged" || normalized === "clean") {
    return normalized;
  }
  return "all";
}

function normalizeModerationUserAction(value) {
  const normalized = asString(value).toLowerCase();
  if (
    normalized === "ban" ||
    normalized === "mute" ||
    normalized === "timeout" ||
    normalized === "shadowban"
  ) {
    return normalized;
  }
  return "";
}

function normalizeModerationReportStatus(value) {
  const normalized = asString(value).toLowerCase();
  if (
    normalized === "open" ||
    normalized === "reviewed" ||
    normalized === "escalated" ||
    normalized === "resolved"
  ) {
    return normalized;
  }
  return "open";
}

function buildSyntheticReportId(scope, messageId) {
  const normalizedMessageId = asString(messageId).trim() || randomUUID();
  return `auto:${normalizeModerationScope(scope, "global")}:${normalizedMessageId}`;
}

function messageHasModerationFlag(message) {
  const messageRecord = safeObject(message);
  const moderation = safeObject(messageRecord.moderation);
  const metadata = safeObject(messageRecord.metadata);
  const moderationState = asString(moderation.state).toLowerCase();
  const flaggedState = asString(messageRecord.flaggedState).toLowerCase();
  return (
    messageRecord.flagged === true ||
    messageRecord.isFlagged === true ||
    moderation.flagged === true ||
    metadata.flagged === true ||
    moderationState === "flagged" ||
    flaggedState === "flagged"
  );
}

function buildModerationContextEntry(message) {
  const messageRecord = safeObject(message);
  return {
    id: asString(messageRecord.id),
    senderId: asString(messageRecord.senderId),
    user: asString(messageRecord.user),
    text: asString(messageRecord.text),
    type: asString(messageRecord.type) || "user",
    createdAt:
      typeof messageRecord.createdAt === "number" && Number.isFinite(messageRecord.createdAt)
        ? messageRecord.createdAt
        : nowMs(),
  };
}

function buildContextPreview(messages, index) {
  const start = Math.max(0, index - 1);
  const end = Math.min(messages.length, index + 2);
  return messages.slice(start, end).map((message) => buildModerationContextEntry(message));
}

function matchesModerationUserFilter(record, userFilter) {
  const normalizedFilter = asString(userFilter).trim().toLowerCase();
  if (!normalizedFilter) {
    return true;
  }

  const fields = [
    record.senderId,
    record.user,
    ...safeArray(record.conversationUserIds),
  ];

  return fields.some((field) => asString(field).toLowerCase().includes(normalizedFilter));
}

function passesModerationTimeWindow(record, startAtMs, endAtMs) {
  const createdAt = typeof record.createdAt === "number" ? record.createdAt : 0;
  if (Number.isFinite(startAtMs) && createdAt < startAtMs) {
    return false;
  }
  if (Number.isFinite(endAtMs) && createdAt > endAtMs) {
    return false;
  }
  return true;
}

function toModerationReportRecord(row) {
  return {
    id: asString(row.id),
    scope: normalizeModerationScope(row.scope, "global"),
    status: normalizeModerationReportStatus(row.status),
    reason: asString(row.reason),
    messageId: asString(row.message_id),
    reportedUserId: asString(row.reported_user_id) || null,
    contextKey: asString(row.context_key) || null,
    linkedTicketId: asString(row.linked_ticket_id) || null,
    escalatedAt: asString(row.escalated_at) || null,
    createdAt: asString(row.created_at) || null,
    updatedAt: asString(row.updated_at) || null,
  };
}

function hasOpenModerationReport(reports) {
  return safeArray(reports).some(
    (report) => normalizeModerationReportStatus(report.status) !== "resolved",
  );
}

async function fetchModerationReportsByMessageIds(messageIds) {
  const normalizedIds = Array.from(
    new Set(safeArray(messageIds).map((messageId) => asString(messageId)).filter(Boolean)),
  );
  if (normalizedIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `
      select *
      from moderation_reports
      where message_id = any($1::text[])
      order by created_at desc
    `,
    [normalizedIds],
  );

  const reportsByMessageId = new Map();
  for (const row of result.rows) {
    const messageId = asString(row.message_id);
    if (!messageId) {
      continue;
    }

    const existingReports = reportsByMessageId.get(messageId) ?? [];
    existingReports.push(toModerationReportRecord(row));
    reportsByMessageId.set(messageId, existingReports);
  }

  return reportsByMessageId;
}

function buildModerationMessageRecord({
  message,
  scope,
  roomId = null,
  conversationUserIds = [],
  contextKey = null,
  reports = [],
  contextPreview = [],
}) {
  const messageRecord = safeObject(message);
  const createdAt =
    typeof messageRecord.createdAt === "number" && Number.isFinite(messageRecord.createdAt)
      ? messageRecord.createdAt
      : nowMs();
  const id = asString(messageRecord.id) || `${scope}:${createdAt}`;
  const normalizedReports = safeArray(reports);
  const flaggedByMetadata = messageHasModerationFlag(messageRecord);
  const isFlagged = flaggedByMetadata || hasOpenModerationReport(normalizedReports);

  return {
    id,
    scope: normalizeModerationScope(scope, "global"),
    roomId: roomId ? asString(roomId) : null,
    contextKey: contextKey ? asString(contextKey) : null,
    conversationUserIds: Array.from(
      new Set(safeArray(conversationUserIds).map((userId) => asString(userId)).filter(Boolean)),
    ),
    senderId: asString(messageRecord.senderId),
    user: asString(messageRecord.user),
    text: asString(messageRecord.text),
    type: asString(messageRecord.type) || "user",
    createdAt,
    isFlagged,
    reports: normalizedReports,
    primaryReportId:
      normalizedReports[0]?.id ?? (flaggedByMetadata ? buildSyntheticReportId(scope, id) : null),
    contextPreview: safeArray(contextPreview),
  };
}

async function buildGlobalModerationRecords(limit) {
  const globalMessageResult = await pool.query(
    `
      select id, room_id, item, created_at
      from global_message_items
      order by created_at desc
      limit $1
    `,
    [limit],
  );

  const globalMessages = globalMessageResult.rows
    .map((row) => {
      const item = safeObject(row.item);
      const createdAt =
        typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Number(row.created_at ?? 0);
      return {
        ...item,
        id: asString(row.id) || asString(item.id) || `${createdAt}`,
        roomId: asString(row.room_id) || asString(item.roomId) || null,
        createdAt,
      };
    })
    .sort((a, b) => {
      const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
      const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
      return aCreatedAt - bCreatedAt;
    });

  const reportsByMessageId = await fetchModerationReportsByMessageIds(
    globalMessages.map((message) => message.id),
  );
  const roomBuckets = new Map();
  for (const message of globalMessages) {
    const bucketKey = asString(message.roomId) || "__global__";
    const bucket = roomBuckets.get(bucketKey) ?? [];
    bucket.push(message);
    roomBuckets.set(bucketKey, bucket);
  }

  const records = [];
  for (const [roomId, messages] of roomBuckets.entries()) {
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      records.push(
        buildModerationMessageRecord({
          message,
          scope: "global",
          roomId: roomId === "__global__" ? null : roomId,
          contextKey: roomId === "__global__" ? "global" : roomId,
          reports: reportsByMessageId.get(asString(message.id)) ?? [],
          contextPreview: buildContextPreview(messages, index),
        }),
      );
    }
  }

  return records;
}

async function buildDmModerationRecords(limit) {
  const threadRowsResult = await pool.query(
    `
      select owner_user_id, other_user_id, messages, updated_at
      from thread_seed_messages
      order by updated_at desc
      limit $1
    `,
    [limit],
  );

  const conversationMap = new Map();
  for (const row of threadRowsResult.rows) {
    const ownerUserId = asString(row.owner_user_id);
    const otherUserId = asString(row.other_user_id);
    if (!ownerUserId || !otherUserId) {
      continue;
    }

    const { userLowId, userHighId, pairKey } = toUserPairKey(ownerUserId, otherUserId);
    const normalizedMessages = safeArray(row.messages)
      .map((entry) => safeObject(entry))
      .sort((a, b) => {
        const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
        const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
        return aCreatedAt - bCreatedAt;
      });
    const previous = conversationMap.get(pairKey);

    if (
      !previous ||
      normalizedMessages.length > previous.messages.length ||
      normalizedMessages[normalizedMessages.length - 1]?.createdAt >
        previous.messages[previous.messages.length - 1]?.createdAt
    ) {
      conversationMap.set(pairKey, {
        pairKey,
        participants: [userLowId, userHighId],
        messages: normalizedMessages,
      });
    }
  }

  const allMessageIds = [];
  for (const conversation of conversationMap.values()) {
    for (const message of conversation.messages) {
      const messageId = asString(message.id);
      if (messageId) {
        allMessageIds.push(messageId);
      }
    }
  }
  const reportsByMessageId = await fetchModerationReportsByMessageIds(allMessageIds);

  const records = [];
  for (const conversation of conversationMap.values()) {
    for (let index = 0; index < conversation.messages.length; index += 1) {
      const message = conversation.messages[index];
      records.push(
        buildModerationMessageRecord({
          message,
          scope: "dm",
          conversationUserIds: conversation.participants,
          contextKey: conversation.pairKey,
          reports: reportsByMessageId.get(asString(message.id)) ?? [],
          contextPreview: buildContextPreview(conversation.messages, index),
        }),
      );
    }
  }

  return records;
}

async function listModerationMessages({
  scope,
  keyword,
  userFilter,
  startAtMs,
  endAtMs,
  flaggedState,
  viewerRole,
  limit,
}) {
  const normalizedScope = normalizeModerationScope(scope, "all");
  const canViewDms = hasAdminPermission(viewerRole, ADMIN_PERMISSIONS.VIEW_DMS);
  const resultLimit = Math.max(1, Math.min(limit, 250));
  const queryLimit = Math.max(resultLimit * 4, 200);
  const keywordFilter = asString(keyword).trim().toLowerCase();
  const normalizedFlaggedState = normalizeFlaggedStateFilter(flaggedState);

  let records = [];
  if (normalizedScope === "global" || normalizedScope === "all") {
    records = records.concat(await buildGlobalModerationRecords(queryLimit));
  }
  if ((normalizedScope === "dm" || normalizedScope === "all") && canViewDms) {
    records = records.concat(await buildDmModerationRecords(queryLimit));
  }

  return records
    .filter((record) => {
      if (keywordFilter && !asString(record.text).toLowerCase().includes(keywordFilter)) {
        return false;
      }
      if (!matchesModerationUserFilter(record, userFilter)) {
        return false;
      }
      if (!passesModerationTimeWindow(record, startAtMs, endAtMs)) {
        return false;
      }
      if (normalizedFlaggedState === "flagged" && !record.isFlagged) {
        return false;
      }
      if (normalizedFlaggedState === "clean" && record.isFlagged) {
        return false;
      }
      if (normalizedScope === "dm" && record.scope !== "dm") {
        return false;
      }
      if (normalizedScope === "global" && record.scope !== "global") {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
      const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
      return bCreatedAt - aCreatedAt;
    })
    .slice(0, resultLimit);
}

function buildMessageTombstone(originalMessage, adminUserId, reason) {
  const originalRecord = safeObject(originalMessage);
  const trimmedReason = asString(reason).trim() || "Violation of terms";
  return {
    ...originalRecord,
    type: "system",
    user: "Moderator",
    senderId: asString(adminUserId),
    text: `[Message removed by moderator: ${trimmedReason}]`,
    moderated: true,
    moderation: {
      ...(safeObject(originalRecord.moderation)),
      deletedAt: nowMs(),
      deletedByAdminId: asString(adminUserId),
      reason: trimmedReason,
      tombstone: true,
    },
  };
}

async function syncConversationPreviewFromMessages(ownerUserId, otherUserId, messages) {
  const row = await getConversationRow(ownerUserId, otherUserId);
  if (!row) {
    return;
  }

  const previousItem = safeObject(row.item);
  const lastMessage = messages.length > 0 ? toConversationLastMessage(messages[messages.length - 1]) : null;
  const nextItem = {
    ...previousItem,
    otherUserId,
    lastMessage,
    lastMessageDate: lastMessage?.createdAt ?? null,
  };

  await pool.query(
    `
      update conversation_items
      set item = $3::jsonb,
          updated_at = now()
      where owner_user_id = $1
        and other_user_id = $2
    `,
    [ownerUserId, otherUserId, toJson(nextItem)],
  );
}

async function moderateDirectMessage({
  adminUserId,
  messageId,
  conversationUserIds,
  leaveTombstone,
  reason,
}) {
  const participantIds = Array.from(
    new Set(safeArray(conversationUserIds).map((userId) => asString(userId)).filter(Boolean)),
  );
  if (participantIds.length !== 2) {
    throw new Error("Direct message moderation requires exactly two conversation participants.");
  }

  const { userLowId, userHighId } = toUserPairKey(participantIds[0], participantIds[1]);
  const conversationPairs = [
    [userLowId, userHighId],
    [userHighId, userLowId],
  ];
  let updated = false;

  for (const [ownerUserId, otherUserId] of conversationPairs) {
    const threadResult = await pool.query(
      `
        select messages
        from thread_seed_messages
        where owner_user_id = $1
          and other_user_id = $2
        limit 1
      `,
      [ownerUserId, otherUserId],
    );

    const row = threadResult.rows[0];
    if (!row) {
      continue;
    }

    const previousMessages = safeArray(row.messages).map((entry) => safeObject(entry));
    let nextMessages = previousMessages;

    if (leaveTombstone) {
      let replaced = false;
      nextMessages = previousMessages.map((message) => {
        if (asString(message.id) !== messageId) {
          return message;
        }
        replaced = true;
        return buildMessageTombstone(message, adminUserId, reason);
      });
      updated = updated || replaced;
    } else {
      nextMessages = previousMessages.filter((message) => asString(message.id) !== messageId);
      updated = updated || nextMessages.length !== previousMessages.length;
    }

    if (nextMessages !== previousMessages) {
      await pool.query(
        `
          update thread_seed_messages
          set messages = $3::jsonb,
              updated_at = now()
          where owner_user_id = $1
            and other_user_id = $2
        `,
        [ownerUserId, otherUserId, toJson(nextMessages)],
      );
      await syncConversationPreviewFromMessages(ownerUserId, otherUserId, nextMessages);
    }
  }

  if (!updated) {
    throw new Error("Message not found in the direct message thread.");
  }

  emitRealtimeDataChanged({
    userIds: [userLowId, userHighId],
    scopes: ["messages", "conversations", "counts"],
    reason: "admin_moderated_dm_message",
  });
}

async function moderateGlobalMessage({
  adminUserId,
  messageId,
  leaveTombstone,
  reason,
}) {
  const globalMessageResult = await pool.query(
    `
      select id, room_id, item, created_at
      from global_message_items
      where id = $1
      limit 1
    `,
    [messageId],
  );

  const row = globalMessageResult.rows[0];
  if (!row) {
    throw new Error("Message not found in global chat.");
  }

  const currentMessage = safeObject(row.item);

  if (leaveTombstone) {
    const tombstoneItem = buildMessageTombstone(
      {
        ...currentMessage,
        id: asString(row.id) || asString(currentMessage.id) || messageId,
        roomId: asString(row.room_id) || asString(currentMessage.roomId) || null,
        createdAt:
          typeof currentMessage.createdAt === "number" && Number.isFinite(currentMessage.createdAt)
            ? currentMessage.createdAt
            : Number(row.created_at ?? nowMs()),
      },
      adminUserId,
      reason,
    );

    await pool.query(
      `
        update global_message_items
        set item = $1::jsonb
        where id = $2
      `,
      [toJson(tombstoneItem), messageId],
    );
  } else {
    await pool.query(`delete from global_message_items where id = $1`, [messageId]);
  }

  emitRealtimeDataChanged({
    scopes: ["global_messages"],
    reason: "admin_moderated_global_message",
  });

  return currentMessage;
}

async function moderateUserAccount({
  adminUserId,
  userId,
  action,
  durationMs,
  reason,
}) {
  const normalizedAction = normalizeModerationUserAction(action);
  if (!normalizedAction) {
    throw new Error("Unsupported moderation action.");
  }

  const normalizedDurationMs =
    durationMs == null || durationMs === ""
      ? null
      : Math.max(1, Math.floor(Number(durationMs)));
  if (durationMs != null && durationMs !== "" && !Number.isFinite(normalizedDurationMs)) {
    throw new Error("Duration must be a positive number of milliseconds.");
  }

  const stateResult = await pool.query(
    `select state from account_state_items where user_id = $1`,
    [userId],
  );
  const currentState = safeObject(stateResult.rows[0]?.state);
  const nextState = {
    ...currentState,
    moderation: {
      ...safeObject(currentState.moderation),
      lastAction: normalizedAction,
      lastActionByAdminId: asString(adminUserId),
      lastActionAt: nowMs(),
      lastReason: asString(reason),
    },
  };

  if (normalizedAction === "mute") {
    nextState.isMuted = true;
    nextState.mutedUntil = normalizedDurationMs ? nowMs() + normalizedDurationMs : null;
  }
  if (normalizedAction === "ban") {
    nextState.isBanned = true;
    nextState.bannedAt = nowMs();
  }
  if (normalizedAction === "timeout") {
    nextState.isTimedOut = true;
    nextState.timedOutUntil = normalizedDurationMs ? nowMs() + normalizedDurationMs : null;
  }
  if (normalizedAction === "shadowban") {
    nextState.isShadowbanned = true;
    nextState.shadowbannedAt = nowMs();
  }

  await pool.query(
    `
      insert into account_state_items (user_id, state, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (user_id)
      do update set state = excluded.state, updated_at = now()
    `,
    [userId, toJson(nextState)],
  );

  return nextState;
}

function isFutureModerationDeadline(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > nowMs();
}

async function getMessagingModerationState(userId) {
  const stateRow = await getAccountStateRow(userId);
  const state = safeObject(stateRow?.state);
  const isMutedActive =
    state.isMuted === true &&
    (!state.mutedUntil || isFutureModerationDeadline(state.mutedUntil));
  const isTimedOutActive =
    state.isTimedOut === true &&
    (!state.timedOutUntil || isFutureModerationDeadline(state.timedOutUntil));

  return {
    state,
    isBanned: state.isBanned === true,
    isMuted: isMutedActive,
    isTimedOut: isTimedOutActive,
    isShadowbanned: state.isShadowbanned === true,
  };
}

async function escalateModerationReport({
  adminUserId,
  reportId,
  scope,
  messageId,
  reportedUserId,
  contextKey,
  reason,
}) {
  const normalizedScope = normalizeModerationScope(scope, "global");
  const normalizedReportId =
    asString(reportId) || buildSyntheticReportId(normalizedScope, asString(messageId) || randomUUID());
  const normalizedReason = asString(reason).trim();

  const existingResult = await pool.query(
    `select * from moderation_reports where id = $1 limit 1`,
    [normalizedReportId],
  );
  const existingReport = existingResult.rows[0] ?? null;
  let linkedTicketId = asString(existingReport?.linked_ticket_id) || null;
  const effectiveReportedUserId =
    asString(reportedUserId) ||
    asString(existingReport?.reported_user_id) ||
    adminUserId;

  if (!linkedTicketId) {
    const supportTicketResult = await pool.query(
      `
        insert into support_tickets (user_id, category, priority, status, assignee_admin_id, notes, status_history)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        returning id::text
      `,
      [
        effectiveReportedUserId,
        "moderation",
        "high",
        "investigating",
        adminUserId,
        toJson([
          {
            type: "moderation_escalation",
            createdAt: new Date().toISOString(),
            adminUserId,
            reportId: normalizedReportId,
            messageId: asString(messageId) || asString(existingReport?.message_id) || null,
            reason: normalizedReason || "Escalated from moderation console",
          },
        ]),
        toJson([
          {
            status: "investigating",
            changedAt: new Date().toISOString(),
            adminUserId,
            reason: normalizedReason || "Moderation escalation",
          },
        ]),
      ],
    );
    linkedTicketId = asString(supportTicketResult.rows[0]?.id) || null;
  }

  const nextPayload = {
    ...safeObject(existingReport?.payload),
    escalatedFrom: "admin_moderation_console",
  };

  if (existingReport) {
    await pool.query(
      `
        update moderation_reports
        set scope = $2,
            message_id = $3,
            reported_user_id = $4,
            context_key = $5,
            status = 'escalated',
            reason = $6,
            payload = $7::jsonb,
            linked_ticket_id = $8::uuid,
            escalated_at = now(),
            escalated_by_admin_id = $9,
            updated_at = now()
        where id = $1
      `,
      [
        normalizedReportId,
        normalizedScope,
        asString(messageId) || asString(existingReport.message_id) || null,
        effectiveReportedUserId,
        asString(contextKey) || asString(existingReport.context_key) || null,
        normalizedReason || asString(existingReport.reason),
        toJson(nextPayload),
        linkedTicketId,
        adminUserId,
      ],
    );
  } else {
    await pool.query(
      `
        insert into moderation_reports (
          id,
          scope,
          message_id,
          reported_user_id,
          context_key,
          status,
          reason,
          payload,
          linked_ticket_id,
          escalated_at,
          escalated_by_admin_id,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, 'escalated', $6, $7::jsonb, $8::uuid, now(), $9, now(), now())
      `,
      [
        normalizedReportId,
        normalizedScope,
        asString(messageId) || null,
        effectiveReportedUserId,
        asString(contextKey) || null,
        normalizedReason || "Escalated from moderation console",
        toJson(nextPayload),
        linkedTicketId,
        adminUserId,
      ],
    );
  }

  await insertAuditLog({
    adminUserId,
    actionType: "ESCALATE_REPORT",
    targetType: "report",
    targetId: normalizedReportId,
    reason: normalizedReason || "Report escalated",
    payload: {
      scope: normalizedScope,
      messageId: asString(messageId) || asString(existingReport?.message_id) || null,
      linkedTicketId,
      reportedUserId: effectiveReportedUserId,
    },
  });

  return {
    reportId: normalizedReportId,
    linkedTicketId,
  };
}

function parseRealtimeMessage(rawData) {
  const text =
    typeof rawData === "string"
      ? rawData
      : Buffer.isBuffer(rawData)
        ? rawData.toString("utf8")
        : "";
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function attachRealtimeServer(server) {
  const realtimeServer = new WebSocketServer({
    server,
    path: "/realtime",
  });

  realtimeServer.on("connection", (socket, request) => {
    void (async () => {
      const requestUrl = new URL(
        request.url ?? "/realtime",
        `http://${request.headers.host ?? "localhost"}`,
      );
      const fallbackUserId =
        !jwks || allowInsecureUserIdHeaderAuth
          ? asString(requestUrl.searchParams.get("userId"))
          : null;
      const token = asString(requestUrl.searchParams.get("token"));

      const viewerUserId = (await resolveUserIdFromToken(token)) ?? fallbackUserId;
      if (!viewerUserId) {
        realtimeMetrics.wsAuthFailures += 1;
        console.warn("[realtime] websocket auth failed", {
          hasToken: Boolean(token),
          remoteAddress: request.socket?.remoteAddress ?? null,
        });
        socket.close(4401, "Unauthenticated");
        return;
      }

      const pendingEvents = new Map();
      realtimePendingEventsBySocket.set(socket, pendingEvents);
      addRealtimeConnection(viewerUserId, socket);
      realtimeMetrics.wsConnectionsOpened += 1;
      console.log("[realtime] connected", {
        userId: viewerUserId,
        activeUsers: realtimeConnectionsByUserId.size,
        activeConnections: getActiveRealtimeConnectionCount(),
      });
      sendRealtime(socket, {
        type: "connected",
        createdAt: nowMs(),
      });

      let cleanedUp = false;
      const cleanup = ({ code, reason }) => {
        if (cleanedUp) return;
        cleanedUp = true;
        realtimeMetrics.wsConnectionsClosed += 1;
        removeRealtimeConnection(viewerUserId, socket);
        realtimePendingEventsBySocket.delete(socket);
        console.log("[realtime] disconnected", {
          userId: viewerUserId,
          code: typeof code === "number" ? code : null,
          reason: reason ?? null,
          activeUsers: realtimeConnectionsByUserId.size,
          activeConnections: getActiveRealtimeConnectionCount(),
        });
      };

      socket.on("message", (rawData) => {
        realtimeMetrics.wsMessagesReceived += 1;
        const payload = parseRealtimeMessage(rawData);
        if (!isRecord(payload)) return;
        const type = asString(payload.type);
        if (type === "ping") {
          realtimeMetrics.wsPingsReceived += 1;
          sendRealtime(socket, {
            type: "pong",
            createdAt: nowMs(),
          });
          return;
        }
        if (type === "ack") {
          realtimeMetrics.wsAcksReceived += 1;
          const eventId = asString(payload.eventId);
          if (!eventId) return;
          const sentAt = pendingEvents.get(eventId);
          if (typeof sentAt !== "number") return;
          pendingEvents.delete(eventId);

          const roundTripMs = Math.max(0, nowMs() - sentAt);
          const rawDeliveryLatencyMs = payload.deliveryLatencyMs;
          const deliveryLatencyMs =
            typeof rawDeliveryLatencyMs === "number" &&
              Number.isFinite(rawDeliveryLatencyMs) &&
              rawDeliveryLatencyMs >= 0 &&
              rawDeliveryLatencyMs <= 120_000
              ? rawDeliveryLatencyMs
              : null;
          recordRealtimeLatencySample(deliveryLatencyMs ?? roundTripMs);
        }
      });

      socket.on("close", (code, rawReason) => {
        const reason = Buffer.isBuffer(rawReason) ? rawReason.toString("utf8") : null;
        cleanup({ code, reason });
      });
      socket.on("error", (error) => {
        console.warn("[realtime] socket error", {
          userId: viewerUserId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        cleanup({ code: 1011, reason: "socket_error" });
      });
    })();
  });

  return realtimeServer;
}

async function getSocialRow(userId) {
  const result = await pool.query(
    `select user_id, item from social_user_items where user_id = $1 limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function getAccountStateRow(userId) {
  const result = await pool.query(
    `select user_id, state from account_state_items where user_id = $1 limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function getUserProfileRow(userId) {
  const result = await pool.query(
    `select user_id, profile from user_profile_items where user_id = $1 limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function upsertSocialRow(userId, item) {
  await pool.query(
    `
      insert into social_user_items (user_id, item, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (user_id)
      do update set item = excluded.item, updated_at = now()
    `,
    [userId, toJson(item)],
  );
}

async function upsertAccountState(userId, state) {
  await pool.query(
    `
      insert into account_state_items (user_id, state, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (user_id)
      do update set state = excluded.state, updated_at = now()
    `,
    [userId, toJson(state)],
  );
}

async function upsertUserProfile(userId, profile) {
  await pool.query(
    `
      insert into user_profile_items (user_id, profile, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (user_id)
      do update set profile = excluded.profile, updated_at = now()
    `,
    [userId, toJson(profile)],
  );
}

async function insertAuditLogRecord(db, entry) {
  const payload = safeObject(entry);
  await db.query(
    `
      insert into audit_logs (
        actor_admin_id,
        actor_role,
        action_type,
        target_type,
        target_id,
        reason,
        metadata,
        result,
        error_message
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    `,
    [
      asString(payload.adminUserId).trim(),
      asString(payload.adminRole).trim() || "admin",
      asString(payload.actionType).trim(),
      asString(payload.targetType).trim(),
      asString(payload.targetId).trim(),
      asString(payload.reason).trim(),
      toJson(safeObject(payload.payload)),
      asString(payload.result).trim() || "success",
      asString(payload.errorMessage).trim() || null,
    ],
  );
}

async function getAdminWalletPreview(db, req, input, { lockTargetRow = false } = {}) {
  const payload = safeObject(input);
  const operation = normalizeAdminWalletOperation(payload.operation);
  const reason = normalizeAdminWalletReason(payload.reason);
  const reversalOfTransactionId = asString(payload.reversalOfTransactionId).trim();

  let targetUserId = asString(payload.userId).trim();
  let sourceTransaction = null;
  if (operation === "reversal") {
    if (!reversalOfTransactionId) {
      throw new Error("reversalOfTransactionId is required for reversal transactions.");
    }

    const sourceResult = await db.query(
      `select * from admin_wallet_credit_transactions where id = $1 limit 1`,
      [reversalOfTransactionId],
    );
    sourceTransaction = sourceResult.rows[0] ?? null;
    if (!sourceTransaction) {
      throw new Error("Referenced transaction was not found.");
    }

    const sourceTargetUserId = asString(sourceTransaction.target_user_id).trim();
    if (!sourceTargetUserId) {
      throw new Error("Referenced transaction is missing a target user.");
    }
    if (targetUserId && targetUserId !== sourceTargetUserId) {
      throw new Error("Referenced transaction belongs to a different target user.");
    }
    targetUserId = sourceTargetUserId;

    const existingReversal = await db.query(
      `select id from admin_wallet_credit_transactions where reversal_of_transaction_id = $1 limit 1`,
      [reversalOfTransactionId],
    );
    if (existingReversal.rows[0]) {
      throw new Error("A reversal entry already exists for this transaction.");
    }
  }

  if (!targetUserId) {
    throw new Error("userId is required.");
  }

  const lockClause = lockTargetRow ? " for update" : "";
  const currentResult = await db.query(
    `select state from account_state_items where user_id = $1 limit 1${lockClause}`,
    [targetUserId],
  );
  const currentState = safeObject(currentResult.rows[0]?.state);
  const currentWallet = safeObject(currentState.wallet);
  const balanceBefore = toWalletSnapshot(currentWallet);
  const delta = emptyWalletDelta();
  let amount = null;
  let currency = null;

  if (operation === "reversal") {
    const sourceDelta = getWalletDeltaFromTransactionRow(sourceTransaction);
    delta.gems = -sourceDelta.gems;
    delta.cash = -sourceDelta.cash;
    delta.fuel = -sourceDelta.fuel;
    amount = Math.max(Math.abs(delta.gems), Math.abs(delta.cash), Math.abs(delta.fuel));
  } else {
    currency = normalizeManagedWalletCurrency(payload.currency);
    amount = parseAdminWalletAdjustmentAmount(payload.amount, {
      allowZero: operation === "set",
    });

    if (operation === "credit") {
      delta[currency] = amount;
    } else if (operation === "debit") {
      delta[currency] = -amount;
    } else {
      delta[currency] = amount - balanceBefore[currency];
    }
  }

  if (!hasWalletDelta(delta)) {
    throw new Error("This transaction does not change the target wallet.");
  }

  const balanceAfter = {
    gems: balanceBefore.gems + delta.gems,
    cash: balanceBefore.cash + delta.cash,
    fuel: balanceBefore.fuel + delta.fuel,
  };

  for (const [walletKey, nextBalance] of Object.entries(balanceAfter)) {
    if (nextBalance < 0) {
      throw new Error(
        `${walletKey} would become negative. Review the requested change before submitting.`,
      );
    }
  }

  return {
    amount,
    balanceAfter,
    balanceBefore,
    currentState,
    currentWallet,
    currency,
    delta,
    metadata: buildAdminRequestMetadata(req, {
      operation,
      previewedAt: new Date().toISOString(),
      reversalOfTransactionId: reversalOfTransactionId || null,
    }),
    operation,
    reason,
    reversalOfTransactionId: reversalOfTransactionId || null,
    sourceTransactionId: sourceTransaction ? asString(sourceTransaction.id).trim() : null,
    targetUserId,
  };
}

async function recordAdminWalletTransaction(req, input) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const preview = await getAdminWalletPreview(client, req, input, { lockTargetRow: true });
    const nextState = {
      ...preview.currentState,
      wallet: {
        ...preview.currentWallet,
        ...preview.balanceAfter,
      },
      updatedAt: nowMs(),
    };

    await client.query(
      `
        insert into account_state_items (user_id, state, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (user_id)
        do update set state = excluded.state, updated_at = now()
      `,
      [preview.targetUserId, toJson(nextState)],
    );

    const metadata = buildAdminRequestMetadata(req, {
      ...preview.metadata,
      committedAt: new Date().toISOString(),
    });
    const transactionResult = await client.query(
      `
        insert into admin_wallet_credit_transactions (
          admin_user_id,
          target_user_id,
          transaction_type,
          reversal_of_transaction_id,
          delta_gems,
          delta_cash,
          delta_fuel,
          reason,
          balance_before,
          balance_after,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
        returning id, created_at
      `,
      [
        req.viewerUserId,
        preview.targetUserId,
        preview.operation,
        preview.reversalOfTransactionId,
        preview.delta.gems,
        preview.delta.cash,
        preview.delta.fuel,
        preview.reason,
        toJson(preview.balanceBefore),
        toJson(preview.balanceAfter),
        toJson(metadata),
      ],
    );

    const transactionRow = transactionResult.rows[0] ?? {};
    const transaction = {
      id: asString(transactionRow.id).trim(),
      createdAt: transactionRow.created_at ?? new Date().toISOString(),
      adminRole: asString(req.viewerRole).trim() || "admin",
      adminUserId: req.viewerUserId,
      amount: preview.amount,
      balanceAfter: preview.balanceAfter,
      balanceBefore: preview.balanceBefore,
      currency: preview.currency,
      delta: preview.delta,
      metadata,
      operation: preview.operation,
      reason: preview.reason,
      reversalOfTransactionId: preview.reversalOfTransactionId,
      sourceTransactionId: preview.sourceTransactionId,
      targetUserId: preview.targetUserId,
    };

    await insertAuditLogRecord(client, {
      adminUserId: req.viewerUserId,
      actionType: preview.operation === "reversal" ? "WALLET_TRANSACTION_REVERSED" : "WALLET_TRANSACTION_COMMITTED",
      payload: {
        metadata,
        transaction,
      },
      reason: preview.reason,
      targetId: preview.targetUserId,
      targetType: "wallet",
    });

    await client.query("commit");

    emitRealtimeDataChanged({
      reason: "admin_wallet_transaction",
      scopes: ["wallet", "account"],
      userIds: [preview.targetUserId],
    });

    return transaction;
  } catch (error) {
    await client.query("rollback");
    if (
      error &&
      typeof error === "object" &&
      error.code === "23505" &&
      asString(error.constraint).includes("single_reversal")
    ) {
      throw new Error("A reversal entry already exists for this transaction.");
    }
    throw error;
  } finally {
    client.release();
  }
}

function normalizeAdminWithdrawalNoteEntry(value) {
  const item = safeObject(value);
  const note = asString(item.note).trim();
  if (!note) {
    return null;
  }

  const type = asString(item.type).trim().toLowerCase() || "note";
  return {
    authorUserId: asString(item.authorUserId).trim(),
    createdAt: normalizeIsoDate(item.createdAt, new Date().toISOString()),
    id: asString(item.id).trim() || randomUUID(),
    note,
    type,
  };
}

function normalizeAdminWithdrawalStatusEvent(value) {
  const item = safeObject(value);
  const status = normalizeWithdrawalWorkflowStatus(item.status, "pending");
  return {
    actorUserId: asString(item.actorUserId).trim(),
    createdAt: normalizeIsoDate(item.createdAt, new Date().toISOString()),
    id: asString(item.id).trim() || randomUUID(),
    reason: asString(item.reason).trim(),
    status,
  };
}

function normalizeAdminWithdrawalSource(row, entry) {
  const item = safeObject(entry);
  const details = safeObject(item.details);
  const profile = safeObject(row?.profile);
  const requestId = asString(item.id).trim() || `withdrawal-${row.user_id}-${nowMs()}`;
  const requestedAt = normalizeIsoDate(item.date, new Date().toISOString());
  const sourceStatus = normalizeWithdrawalWorkflowStatus(item.status, "pending");

  return {
    amountGems: toWalletBalance(item.amountGems),
    amountRealMoney: Number(item.amountRealMoney) || 0,
    details: {
      email: asString(details.email).trim(),
      fullName: asString(details.fullName).trim(),
      phoneNumber: asString(details.phoneNumber).trim(),
    },
    method: asString(item.method).trim() || "Unknown",
    requestId,
    requestedAt,
    sourceStatus,
    userId: asString(row?.user_id).trim(),
    userLabel:
      asString(profile.username).trim() ||
      asString(profile.name).trim() ||
      asString(profile.displayName).trim() ||
      asString(profile.email).trim() ||
      asString(row?.user_id).trim(),
  };
}

async function loadAdminWithdrawalEntries() {
  const { rows } = await pool.query(
    `
      select account.user_id, account.state, profile.profile
      from account_state_items account
      left join user_profile_items profile on profile.user_id = account.user_id
      where jsonb_typeof(account.state->'wallet'->'withdrawalHistory') = 'array'
    `,
  );

  const sources = [];
  for (const row of rows) {
    const state = safeObject(row.state);
    const wallet = safeObject(state.wallet);
    const history = safeArray(wallet.withdrawalHistory);
    for (const entry of history) {
      sources.push(normalizeAdminWithdrawalSource(row, entry));
    }
  }

  const requestIds = sources.map((entry) => entry.requestId);
  const workflowMap = new Map();
  if (requestIds.length > 0) {
    const workflowResult = await pool.query(
      `select * from admin_withdrawal_workflows where request_id = any($1::text[])`,
      [requestIds],
    );
    for (const row of workflowResult.rows) {
      const workflowRequestId = asString(row.request_id).trim();
      const notes = safeArray(row.notes)
        .map((entry) => normalizeAdminWithdrawalNoteEntry(entry))
        .filter(Boolean);
      const statusHistory = safeArray(row.status_history)
        .map((entry) => normalizeAdminWithdrawalStatusEvent(entry))
        .filter(Boolean);
      workflowMap.set(workflowRequestId, {
        decisionReason: asString(row.decision_reason).trim(),
        metadata: safeObject(row.metadata),
        notes,
        status: normalizeWithdrawalWorkflowStatus(row.status, "pending"),
        statusHistory,
      });
    }
  }

  return sources
    .map((source) => {
      const workflow = workflowMap.get(source.requestId) ?? null;
      const statusHistory =
        workflow?.statusHistory.length
          ? workflow.statusHistory
          : [
              {
                actorUserId: source.userId,
                createdAt: source.requestedAt,
                id: `submitted-${source.requestId}`,
                reason: "User submitted withdrawal request.",
                status: source.sourceStatus,
              },
            ];

      return {
        amountGems: source.amountGems,
        amountRealMoney: source.amountRealMoney,
        decisionReason: workflow?.decisionReason ?? "",
        details: source.details,
        id: source.requestId,
        metadata: workflow?.metadata ?? {},
        method: source.method,
        notes: workflow?.notes ?? [],
        requestedAt: source.requestedAt,
        sourceStatus: source.sourceStatus,
        status: workflow?.status ?? source.sourceStatus,
        statusHistory,
        userId: source.userId,
        userLabel: source.userLabel,
      };
    })
    .sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt));
}

async function getAdminWithdrawalEntry(requestId) {
  const normalizedRequestId = asString(requestId).trim();
  if (!normalizedRequestId) {
    return null;
  }

  const entries = await loadAdminWithdrawalEntries();
  return entries.find((entry) => entry.id === normalizedRequestId) ?? null;
}

async function writeAdminWithdrawalWorkflow(db, workflow) {
  const payload = safeObject(workflow);
  await db.query(
    `
      insert into admin_withdrawal_workflows (
        request_id,
        user_id,
        status,
        decision_reason,
        notes,
        status_history,
        metadata,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, now(), now())
      on conflict (request_id)
      do update set
        user_id = excluded.user_id,
        status = excluded.status,
        decision_reason = excluded.decision_reason,
        notes = excluded.notes,
        status_history = excluded.status_history,
        metadata = excluded.metadata,
        updated_at = now()
    `,
    [
      asString(payload.requestId).trim(),
      asString(payload.userId).trim(),
      normalizeWithdrawalWorkflowStatus(payload.status, "pending"),
      asString(payload.decisionReason).trim(),
      toJson(safeArray(payload.notes)),
      toJson(safeArray(payload.statusHistory)),
      toJson(safeObject(payload.metadata)),
    ],
  );
}

async function appendAdminWithdrawalNote(req, requestId, noteText) {
  const entry = await getAdminWithdrawalEntry(requestId);
  if (!entry) {
    throw new Error("Withdrawal request not found.");
  }

  const note = normalizeAdminWithdrawalNoteEntry({
    authorUserId: req.viewerUserId,
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    note: noteText,
    type: "note",
  });
  if (!note) {
    throw new Error("note is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const currentResult = await client.query(
      `select * from admin_withdrawal_workflows where request_id = $1 limit 1 for update`,
      [entry.id],
    );
    const currentRow = currentResult.rows[0] ?? null;
    const currentNotes = safeArray(currentRow?.notes)
      .map((item) => normalizeAdminWithdrawalNoteEntry(item))
      .filter(Boolean);
    const currentHistory = safeArray(currentRow?.status_history)
      .map((item) => normalizeAdminWithdrawalStatusEvent(item))
      .filter(Boolean);

    await writeAdminWithdrawalWorkflow(client, {
      decisionReason: asString(currentRow?.decision_reason).trim() || entry.decisionReason,
      metadata: {
        ...safeObject(currentRow?.metadata),
        ...buildAdminRequestMetadata(req, {
          lastNoteAt: note.createdAt,
        }),
      },
      notes: [...currentNotes, note],
      requestId: entry.id,
      status: normalizeWithdrawalWorkflowStatus(currentRow?.status, entry.status),
      statusHistory: currentHistory.length ? currentHistory : entry.statusHistory,
      userId: entry.userId,
    });

    await insertAuditLogRecord(client, {
      adminUserId: req.viewerUserId,
      actionType: "WITHDRAWAL_NOTE_ADDED",
      payload: {
        metadata: buildAdminRequestMetadata(req, {
          noteId: note.id,
        }),
        note,
        requestId: entry.id,
        userId: entry.userId,
      },
      reason: note.note,
      targetId: entry.id,
      targetType: "wallet",
    });

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getAdminWithdrawalEntry(entry.id);
}

async function reviewAdminWithdrawalRequest(req, requestId, decision, reason) {
  const entry = await getAdminWithdrawalEntry(requestId);
  if (!entry) {
    throw new Error("Withdrawal request not found.");
  }

  const normalizedDecision = asString(decision).trim().toLowerCase();
  if (normalizedDecision !== "approve" && normalizedDecision !== "deny") {
    throw new Error("decision must be approve or deny.");
  }

  const decisionReason = normalizeAdminWalletReason(reason);
  const nextStatus = normalizedDecision === "approve" ? "approved" : "denied";
  const createdAt = new Date().toISOString();
  const historyEntry = normalizeAdminWithdrawalStatusEvent({
    actorUserId: req.viewerUserId,
    createdAt,
    id: randomUUID(),
    reason: decisionReason,
    status: nextStatus,
  });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const currentResult = await client.query(
      `select * from admin_withdrawal_workflows where request_id = $1 limit 1 for update`,
      [entry.id],
    );
    const currentRow = currentResult.rows[0] ?? null;
    const currentNotes = safeArray(currentRow?.notes)
      .map((item) => normalizeAdminWithdrawalNoteEntry(item))
      .filter(Boolean);
    const currentHistory = safeArray(currentRow?.status_history)
      .map((item) => normalizeAdminWithdrawalStatusEvent(item))
      .filter(Boolean);
    const decisionNote = normalizeAdminWithdrawalNoteEntry({
      authorUserId: req.viewerUserId,
      createdAt,
      id: randomUUID(),
      note: decisionReason,
      type: "decision",
    });

    await writeAdminWithdrawalWorkflow(client, {
      decisionReason,
      metadata: {
        ...safeObject(currentRow?.metadata),
        ...buildAdminRequestMetadata(req, {
          decidedAt: createdAt,
          decision: nextStatus,
        }),
      },
      notes: decisionNote ? [...currentNotes, decisionNote] : currentNotes,
      requestId: entry.id,
      status: nextStatus,
      statusHistory: [...(currentHistory.length ? currentHistory : entry.statusHistory), historyEntry],
      userId: entry.userId,
    });

    await insertAuditLogRecord(client, {
      adminUserId: req.viewerUserId,
      actionType: nextStatus === "approved" ? "WITHDRAWAL_APPROVED" : "WITHDRAWAL_DENIED",
      payload: {
        decision: nextStatus,
        metadata: buildAdminRequestMetadata(req, {
          historyEntryId: historyEntry.id,
        }),
        requestId: entry.id,
        userId: entry.userId,
      },
      reason: decisionReason,
      targetId: entry.id,
      targetType: "wallet",
    });

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getAdminWithdrawalEntry(entry.id);
}

async function upsertUserFromAuthWebhookPayload(authUserPayload) {
  const payload = safeObject(authUserPayload);
  const userId = asString(payload.id);
  if (!userId) {
    return null;
  }

  const [accountRow, socialRow, profileRow] = await Promise.all([
    getAccountStateRow(userId),
    getSocialRow(userId),
    getUserProfileRow(userId),
  ]);

  const currentAccountState = safeObject(accountRow?.state);
  const currentSocialItem = safeObject(socialRow?.item);
  const currentProfile = safeObject(profileRow?.profile);

  const email =
    extractAuthPrimaryEmail(payload) ??
    asString(currentAccountState.email) ??
    asString(currentProfile.email) ??
    "";
  const username =
    asString(payload.username) ??
    asString(currentAccountState.username) ??
    asString(currentProfile.username);
  const displayName = deriveAuthDisplayName(payload, userId);
  const avatarUrl =
    asString(payload.image_url) ??
    asString(payload.profile_image_url) ??
    asString(currentSocialItem.avatarUrl) ??
    asString(currentProfile.avatarUrl) ??
    asString(currentAccountState.avatarUrl) ??
    "";
  const role =
    extractRoleFromStoredUserPayload(payload) ??
    asString(currentAccountState.role) ??
    asString(currentProfile.role);
  const publicMetadata = safeObject(payload.public_metadata);

  const nextAccountState = {
    ...currentAccountState,
    username: username ?? displayName,
    displayName,
    email,
    avatarUrl,
    publicMetadata: {
      ...safeObject(currentAccountState.publicMetadata),
      ...publicMetadata,
    },
    public_metadata: {
      ...safeObject(currentAccountState.public_metadata),
      ...publicMetadata,
    },
    ...(role ? { role } : {}),
    authUpdatedAt: payload.updated_at ?? currentAccountState.authUpdatedAt ?? null,
    updatedAt: nowMs(),
  };

  const nextSocialItem = {
    ...currentSocialItem,
    id: userId,
    username: username ?? displayName,
    avatarUrl,
    status: asString(currentSocialItem.status) ?? "offline",
    lastSeen: asString(currentSocialItem.lastSeen) ?? new Date().toISOString(),
  };

  const nextProfile = {
    ...currentProfile,
    id: userId,
    username: username ?? displayName,
    name: displayName,
    email,
    avatarUrl,
    publicMetadata: {
      ...safeObject(currentProfile.publicMetadata),
      ...publicMetadata,
    },
    public_metadata: {
      ...safeObject(currentProfile.public_metadata),
      ...publicMetadata,
    },
    ...(role ? { role } : {}),
    updatedAt: nowMs(),
  };

  await Promise.all([
    upsertAccountState(userId, nextAccountState),
    upsertSocialRow(userId, nextSocialItem),
    upsertUserProfile(userId, nextProfile),
  ]);

  return {
    userId,
    role: role ?? null,
  };
}

async function deleteUserFromAuthWebhookPayload(authUserPayload) {
  const payload = safeObject(authUserPayload);
  const userId = asString(payload.id);
  if (!userId) {
    return null;
  }

  await Promise.all([
    pool.query(`delete from account_state_items where user_id = $1`, [userId]),
    pool.query(`delete from social_user_items where user_id = $1`, [userId]),
    pool.query(`delete from user_profile_items where user_id = $1`, [userId]),
    pool.query(`delete from mention_user_items where id = $1`, [userId]),
  ]);

  return userId;
}

async function getLiveRow(liveId) {
  const result = await pool.query(`select id, item from live_items where id = $1 limit 1`, [liveId]);
  return result.rows[0] ?? null;
}

async function upsertLiveRow(liveId, item) {
  await pool.query(
    `
      insert into live_items (id, item, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id)
      do update set item = excluded.item, updated_at = now()
    `,
    [liveId, toJson(item)],
  );
}

async function buildDefaultLiveHosts(ownerUserId) {
  const [socialRow, accountRow] = await Promise.all([
    getSocialRow(ownerUserId),
    getAccountStateRow(ownerUserId),
  ]);
  const socialItem = safeObject(socialRow?.item);
  const accountState = safeObject(accountRow?.state);
  const username = asString(socialItem.username) ?? deriveUsername(ownerUserId, accountState);
  return [
    {
      id: ownerUserId,
      username,
      name: username,
      age: 0,
      country: "",
      bio: asString(socialItem.statusText) ?? "",
      verified: false,
      avatar: asString(socialItem.avatarUrl) ?? asString(accountState.avatarUrl) ?? "",
    },
  ];
}

async function getUserDisplay(userId) {
  const [socialRow, accountRow] = await Promise.all([
    getSocialRow(userId),
    getAccountStateRow(userId),
  ]);

  const socialItem = safeObject(socialRow?.item);
  const accountState = safeObject(accountRow?.state);
  const accountEmail = asString(accountState.email);

  const name =
    asString(socialItem.username) ??
    asString(accountState.displayName) ??
    (accountEmail ? accountEmail.split("@")[0] : undefined) ??
    userId;

  const avatar = asString(socialItem.avatarUrl) ?? asString(accountState.avatarUrl) ?? "";

  return {
    id: userId,
    name,
    avatar,
    level: 1,
  };
}

async function getAcceptedFriendIds(viewerUserId) {
  const result = await pool.query(
    `
      select user_low_id, user_high_id
      from friendships
      where status = 'accepted'
        and (user_low_id = $1 or user_high_id = $1)
    `,
    [viewerUserId],
  );

  const acceptedFriendIds = new Set();
  for (const row of result.rows) {
    if (row.user_low_id === viewerUserId && row.user_high_id) {
      acceptedFriendIds.add(row.user_high_id);
    } else if (row.user_high_id === viewerUserId && row.user_low_id) {
      acceptedFriendIds.add(row.user_low_id);
    }
  }

  const notificationRows = await pool.query(
    `select item from notification_items where user_id = $1`,
    [viewerUserId],
  );
  for (const row of notificationRows.rows) {
    const item = safeObject(row.item);
    if (item.type !== "friend_request") continue;
    if (item.status !== "accepted") continue;
    const fromUser = safeObject(item.fromUser);
    const counterpartId = asString(fromUser.id);
    if (counterpartId) acceptedFriendIds.add(counterpartId);
  }

  return Array.from(acceptedFriendIds);
}

function mergeSocialUsers(socialRows, accountRows) {
  const merged = new Map();

  for (const row of socialRows) {
    const item = safeObject(row.item);
    const userId = asString(item.id) ?? asString(row.user_id);
    if (!userId) continue;
    const status = resolveSocialStatusFromItem(item);
    merged.set(userId, {
      ...item,
      id: userId,
      status,
      isLive: status === "live",
      isOnline: socialStatusIsOnline(status),
      statusText: asString(item.statusText) ?? asString(item.statusMessage),
    });
  }

  for (const row of accountRows) {
    const userId = asString(row.user_id);
    if (!userId) continue;

    const state = safeObject(row.state);
    const fallbackStatus =
      normalizeSocialStatusValue(state.status) ??
      normalizeSocialStatusValue(state.presenceStatus) ??
      (state.isLive === true ? "live" : state.isOnline === true ? "online" : "offline");
    const fallback = {
      id: userId,
      username: deriveUsername(userId, state),
      avatarUrl: asString(state.avatarUrl) ?? "",
      status: fallbackStatus,
      isLive: fallbackStatus === "live",
      isOnline: socialStatusIsOnline(fallbackStatus),
      statusText: asString(state.statusText) ?? asString(state.statusMessage),
      lastSeen: asString(state.lastSeen),
    };

    const existing = merged.get(userId);
    if (!existing) {
      merged.set(userId, fallback);
      continue;
    }

    const existingUsername = asString(existing.username);
    const existingId = asString(existing.id) ?? userId;
    const fallbackUsername = asString(fallback.username);
    const mergedStatus = resolveSocialStatusFromItem({
      ...fallback,
      ...existing,
      status: asString(existing.status) ?? fallback.status,
    });

    merged.set(userId, {
      ...fallback,
      ...existing,
      username:
        existingUsername && existingUsername !== "me" && existingUsername !== existingId
          ? existingUsername
          : fallbackUsername ?? existingUsername ?? existingId,
      avatarUrl: asString(existing.avatarUrl) ?? asString(fallback.avatarUrl) ?? "",
      statusText:
        asString(existing.statusText) ??
        asString(existing.statusMessage) ??
        asString(fallback.statusText),
      lastSeen: asString(existing.lastSeen) ?? asString(fallback.lastSeen),
      status: mergedStatus,
      isLive: mergedStatus === "live",
      isOnline: socialStatusIsOnline(mergedStatus),
    });
  }

  return Array.from(merged.values());
}

async function getConversationRow(ownerUserId, otherUserId) {
  const result = await pool.query(
    `
      select item
      from conversation_items
      where owner_user_id = $1
        and other_user_id = $2
      limit 1
    `,
    [ownerUserId, otherUserId],
  );
  return result.rows[0] ?? null;
}

async function upsertConversation(ownerUserId, otherUserId, message, incrementUnread) {
  const existingRow = await getConversationRow(ownerUserId, otherUserId);
  const previousItem = safeObject(existingRow?.item);
  const previousUnread =
    typeof previousItem.unreadCount === "number" && Number.isFinite(previousItem.unreadCount)
      ? Math.max(0, previousItem.unreadCount)
      : 0;

  const lastMessage = toConversationLastMessage(message);
  const nextItem = {
    ...previousItem,
    id: asString(previousItem.id) ?? `dm-${ownerUserId}-${otherUserId}`,
    otherUserId,
    lastMessage,
    unreadCount: incrementUnread ? previousUnread + 1 : previousUnread,
    pinned: previousItem.pinned === true,
    muted: previousItem.muted === true,
    streak:
      typeof previousItem.streak === "number" && Number.isFinite(previousItem.streak)
        ? previousItem.streak
        : undefined,
    streakExpiresAt: asString(previousItem.streakExpiresAt),
    lastMessageDate: lastMessage.createdAt,
  };

  await pool.query(
    `
      insert into conversation_items (owner_user_id, other_user_id, item, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_user_id, other_user_id)
      do update set item = excluded.item, updated_at = now()
    `,
    [ownerUserId, otherUserId, toJson(nextItem)],
  );
}

async function getThreadRow(ownerUserId, otherUserId) {
  const result = await pool.query(
    `
      select messages
      from thread_seed_messages
      where owner_user_id = $1
        and other_user_id = $2
      limit 1
    `,
    [ownerUserId, otherUserId],
  );
  return result.rows[0] ?? null;
}

async function appendThreadMessage(ownerUserId, otherUserId, message) {
  const messageId = asString(message.id);
  const row = await getThreadRow(ownerUserId, otherUserId);
  const previousMessages = safeArray(row?.messages).map((entry) => safeObject(entry));
  const isDuplicate =
    !!messageId &&
    previousMessages.some((existingMessage) => asString(existingMessage.id) === messageId);

  if (isDuplicate) {
    return false;
  }

  const nextMessages = [...previousMessages, message].sort((a, b) => {
    const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
    const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
    return aCreatedAt - bCreatedAt;
  });

  await pool.query(
    `
      insert into thread_seed_messages (owner_user_id, other_user_id, messages, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_user_id, other_user_id)
      do update set messages = excluded.messages, updated_at = now()
    `,
    [ownerUserId, otherUserId, toJson(nextMessages)],
  );

  return true;
}

async function markThreadMessagesRead(ownerUserId, otherUserId, messageSenderId, readAtMs) {
  const row = await getThreadRow(ownerUserId, otherUserId);
  if (!row) return false;

  const previousMessages = safeArray(row.messages).map((entry) => safeObject(entry));
  let changed = false;
  const nextMessages = previousMessages.map((entry) => {
    const senderId = asString(entry.senderId);
    if (!senderId || senderId !== messageSenderId) {
      return entry;
    }

    const existingReadAt =
      typeof entry.readAt === "number" && Number.isFinite(entry.readAt) ? entry.readAt : null;
    if (existingReadAt !== null && existingReadAt >= readAtMs) {
      return entry;
    }

    changed = true;
    const existingDeliveredAt =
      typeof entry.deliveredAt === "number" && Number.isFinite(entry.deliveredAt)
        ? entry.deliveredAt
        : readAtMs;

    return {
      ...entry,
      deliveredAt: existingDeliveredAt,
      readAt: readAtMs,
    };
  });

  if (!changed) {
    return false;
  }

  await pool.query(
    `
      update thread_seed_messages
      set messages = $3::jsonb,
          updated_at = now()
      where owner_user_id = $1
        and other_user_id = $2
    `,
    [ownerUserId, otherUserId, toJson(nextMessages)],
  );

  return true;
}

async function markConversationLastMessageRead(ownerUserId, otherUserId, messageSenderId, readAtMs) {
  const row = await getConversationRow(ownerUserId, otherUserId);
  if (!row) return false;

  const previousItem = safeObject(row.item);
  const previousLastMessage = safeObject(previousItem.lastMessage);
  const previousLastSenderId = asString(previousLastMessage.senderId);
  if (!previousLastSenderId || previousLastSenderId !== messageSenderId) {
    return false;
  }

  const existingReadAt =
    typeof previousLastMessage.readAt === "number" && Number.isFinite(previousLastMessage.readAt)
      ? previousLastMessage.readAt
      : null;
  if (existingReadAt !== null && existingReadAt >= readAtMs) {
    return false;
  }

  const nextLastMessage = {
    ...previousLastMessage,
    deliveredAt:
      typeof previousLastMessage.deliveredAt === "number" &&
        Number.isFinite(previousLastMessage.deliveredAt)
        ? previousLastMessage.deliveredAt
        : readAtMs,
    readAt: readAtMs,
  };
  const nextItem = {
    ...previousItem,
    otherUserId,
    lastMessage: nextLastMessage,
    lastMessageDate:
      asString(previousItem.lastMessageDate) ??
      asString(nextLastMessage.createdAt) ??
      previousItem.lastMessageDate,
  };

  await pool.query(
    `
      update conversation_items
      set item = $3::jsonb,
          updated_at = now()
      where owner_user_id = $1
        and other_user_id = $2
    `,
    [ownerUserId, otherUserId, toJson(nextItem)],
  );

  return true;
}

async function upsertFriendship({ userAId, userBId, status, requestedBy }) {
  const pair = getFriendshipPair(userAId, userBId);
  await pool.query(
    `
      insert into friendships (pair_key, user_low_id, user_high_id, status, requested_by, updated_at)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (pair_key)
      do update set
        user_low_id = excluded.user_low_id,
        user_high_id = excluded.user_high_id,
        status = excluded.status,
        requested_by = excluded.requested_by,
        updated_at = excluded.updated_at
    `,
    [pair.pairKey, pair.userLowId, pair.userHighId, status, requestedBy ?? null, nowMs()],
  );
}

async function deleteFriendship(userAId, userBId) {
  const pair = getFriendshipPair(userAId, userBId);
  await pool.query(`delete from friendships where pair_key = $1`, [pair.pairKey]);
}

async function fetchTracks() {
  const result = await pool.query(
    `
      select
        t.id::text as id,
        t.title,
        coalesce(a.name, 'Unknown Artist') as artist,
        coalesce(t.artwork_url, '') as artwork,
        coalesce(t.duration_seconds, 0) as duration,
        coalesce(t.audio_url, '') as url
      from tracks t
      left join artists a on a.id = t.artist_id
      order by t.created_at desc
      limit 500
    `,
  );

  return result.rows;
}

async function fetchPlaylists() {
  const result = await pool.query(
    `
      select
        p.id::text as id,
        p.title,
        coalesce(p.description, '') as description,
        coalesce(p.cover_url, '') as cover,
        coalesce(
          array_remove(array_agg(pt.track_id::text order by pt.position), null),
          '{}'::text[]
        ) as tracks
      from playlists p
      left join playlist_tracks pt on pt.playlist_id = p.id
      group by p.id
      order by p.created_at desc
      limit 300
    `,
  );

  return result.rows.map((row) => ({
    ...row,
    tracks: Array.isArray(row.tracks) ? row.tracks : [],
  }));
}

async function fetchArtists() {
  const result = await pool.query(
    `
      select
        id::text as id,
        name,
        ''::text as bio,
        coalesce(image_url, '') as image
      from artists
      order by created_at desc
      limit 300
    `,
  );

  return result.rows;
}

const SNAPSHOT_SCOPES = new Set([
  "messages",
  "mention_users",
  "conversations",
  "global_messages",
  "notifications",
  "social",
  "friendships",
  "live",
  "leaderboard",
  "videos",
  "music",
  "search",
]);

function parseSnapshotScopes(value) {
  const rawValues = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const parsedScopes = new Set();

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") continue;
    for (const part of rawValue.split(",")) {
      const normalizedScope = asString(part)?.toLowerCase();
      if (!normalizedScope) continue;
      if (!SNAPSHOT_SCOPES.has(normalizedScope)) continue;
      parsedScopes.add(normalizedScope);
    }
  }

  return Array.from(parsedScopes);
}

function toConversations(rows) {
  return rows
    .map((row) => safeObject(row.item))
    .filter((item) => asString(item.otherUserId))
    .sort((a, b) => {
      const aDate = Date.parse(
        asString(a.lastMessageDate) ?? asString(safeObject(a.lastMessage).createdAt) ?? "",
      );
      const bDate = Date.parse(
        asString(b.lastMessageDate) ?? asString(safeObject(b.lastMessage).createdAt) ?? "",
      );
      const aValue = Number.isFinite(aDate) ? aDate : 0;
      const bValue = Number.isFinite(bDate) ? bDate : 0;
      return bValue - aValue;
    });
}

function toGlobalMessages(rows) {
  return rows
    .map((row) => {
      const message = safeObject(row.item);
      const roomId = asString(row.room_id) ?? asString(message.roomId);
      return roomId
        ? {
          ...message,
          roomId,
        }
        : message;
    })
    .sort((a, b) => {
      const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
      const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
      return aCreatedAt - bCreatedAt;
    });
}

function toMentionUsers(rows, fallbackSocialUsers = []) {
  if (rows.length > 0) {
    return rows.map((row) => safeObject(row.item));
  }

  return fallbackSocialUsers.slice(0, 500).map((user) => ({
    id: user.id,
    name: asString(user.username) ?? asString(user.id) ?? "",
    username: asString(user.username) ?? asString(user.id) ?? "",
    avatarUrl: asString(user.avatarUrl) ?? "",
  }));
}

function toThreadSeedMessagesByUserId(rows) {
  return rows.reduce((acc, row) => {
    const otherUserId = asString(row.other_user_id);
    if (!otherUserId) return acc;
    const messages = safeArray(row.messages)
      .map((entry) => safeObject(entry))
      .sort((a, b) => {
        const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
        const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
        return aCreatedAt - bCreatedAt;
      });
    acc[otherUserId] = messages;
    return acc;
  }, {});
}

function toNotifications(rows) {
  return rows
    .map((row) => safeObject(row.item))
    .filter((item) => !shouldHideNotificationItem(item))
    .sort((a, b) => {
      const aCreatedAt = typeof a.createdAt === "number" ? a.createdAt : 0;
      const bCreatedAt = typeof b.createdAt === "number" ? b.createdAt : 0;
      return bCreatedAt - aCreatedAt;
    });
}

async function fetchLiveFields() {
  const [liveRows, boostRows, knownLiveUserRows, livePresenceRows] = await Promise.all([
    pool.query(`select item from live_items order by updated_at desc limit 300`),
    pool.query(`select item from live_boost_leaderboard_items order by updated_at desc limit 300`),
    pool.query(`select item from known_live_user_items order by updated_at desc limit 400`),
    pool.query(
      `
        select item
        from live_presence_items
        where updated_at >= now() - ($1::int * interval '1 millisecond')
        order by updated_at desc
        limit 600
      `,
      [effectiveLivePresenceTtlMs],
    ),
  ]);
  const livePresence = [];
  for (const row of livePresenceRows.rows) {
    const item = normalizeLivePresenceItem(row.item);
    if (item) {
      livePresence.push(item);
    }
  }

  const livePresenceByLiveId = new Map();
  for (const presenceItem of livePresence) {
    let entry = livePresenceByLiveId.get(presenceItem.liveId);
    if (!entry) {
      entry = {
        watching: new Set(),
        hosting: new Set(),
        participants: new Set(),
      };
      livePresenceByLiveId.set(presenceItem.liveId, entry);
    }
    entry.participants.add(presenceItem.userId);
    if (presenceItem.activity === "hosting") {
      entry.hosting.add(presenceItem.userId);
    } else {
      entry.watching.add(presenceItem.userId);
    }
  }

  const snapshotNowMs = nowMs();
  const lives = liveRows.rows.reduce((acc, row) => {
    const liveItem = safeObject(row.item);
    const liveId = asString(liveItem.id);
    const ownerUserId = asString(liveItem.ownerUserId);
    const bannedUserIdSet = new Set(normalizeUserIds(liveItem.bannedUserIds));
    const hosts = normalizeLiveHosts(liveItem.hosts).filter((host) => {
      const hostId = asString(host.id);
      return hostId ? !bannedUserIdSet.has(hostId) : true;
    });

    const livePresenceEntry = liveId ? livePresenceByLiveId.get(liveId) : null;
    const hasActiveHostPresence = Boolean(
      livePresenceEntry && livePresenceEntry.hosting.size > 0,
    );
    const updatedAtMs =
      typeof liveItem.updatedAt === "number" && Number.isFinite(liveItem.updatedAt)
        ? liveItem.updatedAt
        : snapshotNowMs;
    const isStaleWithoutHostPresence =
      !hasActiveHostPresence && snapshotNowMs - updatedAtMs > effectiveLiveHostStaleGraceMs;
    if (isStaleWithoutHostPresence) {
      return acc;
    }

    const hostingUserIds = new Set(
      hosts
        .map((host) => asString(host.id))
        .filter(Boolean),
    );
    if (ownerUserId && !bannedUserIdSet.has(ownerUserId)) {
      hostingUserIds.add(ownerUserId);
    }
    if (livePresenceEntry) {
      for (const hostingUserId of livePresenceEntry.hosting) {
        if (!bannedUserIdSet.has(hostingUserId)) {
          hostingUserIds.add(hostingUserId);
        }
      }
    }

    const watcherUserIds = livePresenceEntry
      ? Array.from(livePresenceEntry.watching).filter(
        (watcherUserId) =>
          !hostingUserIds.has(watcherUserId) && !bannedUserIdSet.has(watcherUserId),
      )
      : [];
    const participantUserIds = livePresenceEntry
      ? Array.from(livePresenceEntry.participants).filter(
        (participantUserId) => !bannedUserIdSet.has(participantUserId),
      )
      : [];
    const computedViewerCount = new Set([...Array.from(hostingUserIds), ...watcherUserIds]).size;
    const fallbackViewerCount = parseLiveViewerCount(liveItem.viewers, 0);

    acc.push({
      ...liveItem,
      id: liveId ?? liveItem.id,
      hosts,
      images: hosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
      viewers: Math.max(fallbackViewerCount, computedViewerCount),
      watcherUserIds,
      participantUserIds,
      hostingUserIds: Array.from(hostingUserIds),
      bannedUserIds: Array.from(bannedUserIdSet),
    });
    return acc;
  }, []);

  return {
    lives,
    boostLeaderboard: boostRows.rows.map((row) => safeObject(row.item)),
    knownLiveUsers: knownLiveUserRows.rows.map((row) => safeObject(row.item)),
    livePresence,
  };
}

async function fetchSocialUsers() {
  const [socialRows, accountRows] = await Promise.all([
    pool.query(`select user_id, item from social_user_items`),
    pool.query(`select user_id, state from account_state_items`),
  ]);
  return mergeSocialUsers(socialRows.rows, accountRows.rows);
}

async function fetchConversations(viewerUserId) {
  const conversationRows = await pool.query(
    `select item from conversation_items where owner_user_id = $1`,
    [viewerUserId],
  );
  return toConversations(conversationRows.rows);
}

async function fetchGlobalMessages(viewerUserId = null, viewerRole = null) {
  const normalizedViewerUserId = asOptionalString(viewerUserId);
  const effectiveViewerRole =
    viewerRole ??
    (normalizedViewerUserId ? await resolveStoredUserRole(normalizedViewerUserId) : null);
  const canViewHiddenMessages = hasAdminAccessRole(effectiveViewerRole);
  const globalMessageRows = await pool.query(
    `select room_id, item from global_message_items order by created_at asc limit 1500`,
  );
  const messages = toGlobalMessages(globalMessageRows.rows);
  return messages.filter((message) => {
    const moderation = safeObject(message.moderation);
    if (moderation.shadowHidden !== true) {
      return true;
    }
    if (canViewHiddenMessages) {
      return true;
    }
    return asString(message.senderId) === normalizedViewerUserId;
  });
}

async function fetchMentionUsers(fallbackSocialUsers) {
  const mentionRows = await pool.query(
    `select item from mention_user_items order by updated_at desc limit 500`,
  );
  return toMentionUsers(mentionRows.rows, fallbackSocialUsers);
}

async function fetchThreadSeedMessagesByUserId(viewerUserId) {
  const threadRows = await pool.query(
    `
      select other_user_id, messages
      from thread_seed_messages
      where owner_user_id = $1
    `,
    [viewerUserId],
  );
  return toThreadSeedMessagesByUserId(threadRows.rows);
}

async function fetchNotifications(viewerUserId) {
  const notificationRows = await pool.query(
    `select id, item from notification_items where user_id = $1`,
    [viewerUserId],
  );
  return toNotifications(notificationRows.rows);
}

async function fetchLeaderboardItems() {
  const leaderboardRows = await pool.query(
    `select item from leaderboard_items order by updated_at desc limit 400`,
  );
  return leaderboardRows.rows.map((row) => safeObject(row.item));
}

async function fetchVideos() {
  const videoRows = await pool.query(`select item from video_items order by updated_at desc limit 400`);
  return videoRows.rows.map((row) => safeObject(row.item));
}


const ADMIN_WALLET_PRIMARY_SPEND_SQL = `coalesce(
  account.state->'wallet'->>'totalSpent',
  account.state->'wallet'->>'spendTotal',
  account.state->'wallet'->>'spent'
)`;

const ADMIN_WALLET_FALLBACK_SPEND_SQL = `(
  case
    when coalesce(account.state->'wallet'->>'cashSpent', '') ~ '^-?\\d+(\\.\\d+)?$'
      then (account.state->'wallet'->>'cashSpent')::numeric
    else 0
  end
  +
  case
    when coalesce(account.state->'wallet'->>'gemsSpent', '') ~ '^-?\\d+(\\.\\d+)?$'
      then (account.state->'wallet'->>'gemsSpent')::numeric
    else 0
  end
)`;

const ADMIN_USER_SPEND_TOTAL_SQL = `case
  when coalesce(${ADMIN_WALLET_PRIMARY_SPEND_SQL}, '') ~ '^-?\\d+(\\.\\d+)?$'
    then (${ADMIN_WALLET_PRIMARY_SPEND_SQL})::numeric
  when coalesce(account.state->'wallet'->>'cashSpent', '') ~ '^-?\\d+(\\.\\d+)?$'
    or coalesce(account.state->'wallet'->>'gemsSpent', '') ~ '^-?\\d+(\\.\\d+)?$'
    then ${ADMIN_WALLET_FALLBACK_SPEND_SQL}
  else null
end`;

const ADMIN_USER_FROM_SQL = `
  from account_state_items account
  full outer join social_user_items social on social.user_id = account.user_id
  left join live_presence_items presence on presence.user_id = coalesce(account.user_id, social.user_id)
  left join (
    select user_id, count(*)::int as report_count
    from support_tickets
    group by user_id
  ) ticket_counts on ticket_counts.user_id = coalesce(account.user_id, social.user_id)
`;

const ADMIN_USER_SQL = {
  id: `coalesce(account.user_id, social.user_id)`,
  username: `coalesce(
    social.item->>'username',
    account.state->>'username',
    account.state->>'displayName',
    nullif(split_part(coalesce(account.state->>'email', ''), '@', 1), ''),
    coalesce(account.user_id, social.user_id)
  )`,
  email: `coalesce(account.state->>'email', '')`,
  role: `coalesce(
    account.state->>'role',
    account.state->'publicMetadata'->>'role',
    account.state->'public_metadata'->>'role',
    'user'
  )`,
  accountStatus: `coalesce(account.state->>'accountStatus', account.state->>'status', 'active')`,
  joinDate: `coalesce(
    account.state->>'joinDate',
    account.state->>'joinedAt',
    account.state->>'createdAt',
    account.updated_at::text,
    social.updated_at::text
  )`,
  lastActive: `coalesce(
    account.state->>'lastActive',
    account.state->>'lastSeen',
    social.item->>'lastSeen',
    account.updated_at::text,
    social.updated_at::text
  )`,
  presenceStatus: `coalesce(
    nullif(lower(social.item->>'status'), ''),
    nullif(lower(account.state->>'presenceStatus'), ''),
    case
      when account.state->>'isLive' = 'true' then 'live'
      when account.state->>'isOnline' = 'true' then 'online'
      else 'offline'
    end
  )`,
  activity: `case
    when lower(coalesce(presence.item->>'activity', '')) in ('hosting', 'watching')
      then lower(presence.item->>'activity')
    else null
  end`,
  reportCount: `coalesce(ticket_counts.report_count, 0)`,
  spendTotal: ADMIN_USER_SPEND_TOTAL_SQL,
};

async function fetchAdminUsersPage({
  page,
  limit,
  queryText,
  role,
  accountStatus,
  reportCountMin,
  reportCountMax,
  activity,
  spendMin,
  spendMax,
  sortBy,
  sortOrder,
}) {
  const whereConditions = [`${ADMIN_USER_SQL.id} is not null`];
  const whereParams = [];

  const normalizedQueryText = asString(queryText).trim().toLowerCase();
  if (normalizedQueryText) {
    const escapedQuery = escapeSqlLikeValue(normalizedQueryText);
    const fuzzyQuery = `%${escapedQuery}%`;

    whereParams.push(fuzzyQuery);
    const idSearchPosition = whereParams.length;
    whereParams.push(fuzzyQuery);
    const usernameSearchPosition = whereParams.length;
    whereParams.push(normalizedQueryText);
    const emailExactPosition = whereParams.length;

    const searchConditions = [
      `lower(${ADMIN_USER_SQL.id}) like $${idSearchPosition} escape '\\'`,
      `lower(${ADMIN_USER_SQL.username}) like $${usernameSearchPosition} escape '\\'`,
      `lower(${ADMIN_USER_SQL.email}) = $${emailExactPosition}`,
    ];

    const emailPartialSearch = buildAdminEmailPartialSearch(normalizedQueryText);
    if (emailPartialSearch) {
      whereParams.push(emailPartialSearch.pattern);
      const emailPartialPosition = whereParams.length;
      if (emailPartialSearch.field === "email") {
        searchConditions.push(`lower(${ADMIN_USER_SQL.email}) like $${emailPartialPosition} escape '\\'`);
      } else {
        searchConditions.push(
          `lower(split_part(${ADMIN_USER_SQL.email}, '@', 1)) like $${emailPartialPosition} escape '\\'`,
        );
      }
    }

    whereConditions.push(`(
      ${searchConditions.join("\n      or ")}
    )`);
  }

  if (role) {
    whereParams.push(role.toLowerCase());
    const rolePosition = whereParams.length;
    whereConditions.push(`lower(${ADMIN_USER_SQL.role}) = $${rolePosition}`);
  }

  if (accountStatus) {
    whereParams.push(accountStatus.toLowerCase());
    const statusPosition = whereParams.length;
    whereConditions.push(`lower(${ADMIN_USER_SQL.accountStatus}) = $${statusPosition}`);
  }

  if (reportCountMin !== null) {
    whereParams.push(reportCountMin);
    const minReportCountPosition = whereParams.length;
    whereConditions.push(`${ADMIN_USER_SQL.reportCount} >= $${minReportCountPosition}`);
  }

  if (reportCountMax !== null) {
    whereParams.push(reportCountMax);
    const maxReportCountPosition = whereParams.length;
    whereConditions.push(`${ADMIN_USER_SQL.reportCount} <= $${maxReportCountPosition}`);
  }

  if (activity === "hosting" || activity === "watching") {
    whereParams.push(activity);
    const activityPosition = whereParams.length;
    whereConditions.push(`${ADMIN_USER_SQL.activity} = $${activityPosition}`);
  } else if (activity === "idle") {
    whereConditions.push(`${ADMIN_USER_SQL.activity} is null`);
  }

  if (spendMin !== null) {
    whereParams.push(spendMin);
    const spendMinPosition = whereParams.length;
    whereConditions.push(`${ADMIN_USER_SQL.spendTotal} >= $${spendMinPosition}`);
  }

  if (spendMax !== null) {
    whereParams.push(spendMax);
    const spendMaxPosition = whereParams.length;
    whereConditions.push(`${ADMIN_USER_SQL.spendTotal} <= $${spendMaxPosition}`);
  }

  const hasSortBy = Object.prototype.hasOwnProperty.call(ADMIN_USER_SQL, sortBy);
  const sortExpression = hasSortBy ? ADMIN_USER_SQL[sortBy] : ADMIN_USER_SQL.joinDate;
  const normalizedSortOrder = sortOrder === "asc" ? "asc" : "desc";
  const whereClause = `where ${whereConditions.join(" and ")}`;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `
      select
        count(*)::int as total,
        coalesce(bool_or(${ADMIN_USER_SQL.spendTotal} is not null), false) as "spendDataAvailable"
      ${ADMIN_USER_FROM_SQL}
      ${whereClause}
    `,
    whereParams,
  );

  const limitPosition = whereParams.length + 1;
  const offsetPosition = whereParams.length + 2;
  const usersResult = await pool.query(
    `
      select
        ${ADMIN_USER_SQL.id} as id,
        ${ADMIN_USER_SQL.username} as username,
        ${ADMIN_USER_SQL.email} as email,
        ${ADMIN_USER_SQL.role} as role,
        ${ADMIN_USER_SQL.accountStatus} as "accountStatus",
        ${ADMIN_USER_SQL.joinDate} as "joinDate",
        ${ADMIN_USER_SQL.lastActive} as "lastActive",
        ${ADMIN_USER_SQL.presenceStatus} as "presenceStatus",
        ${ADMIN_USER_SQL.activity} as activity,
        ${ADMIN_USER_SQL.reportCount} as "reportCount",
        ${ADMIN_USER_SQL.spendTotal} as "spendTotal"
      ${ADMIN_USER_FROM_SQL}
      ${whereClause}
      order by ${sortExpression} ${normalizedSortOrder}, ${ADMIN_USER_SQL.id} asc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    [...whereParams, limit, offset],
  );

  const users = usersResult.rows.map((row) => {
    const id = asString(row.id) ?? "";
    const joinDate = normalizeIsoDate(row.joinDate);
    return {
      id,
      username: asString(row.username) ?? id,
      email: asString(row.email) ?? "",
      role: asString(row.role) ?? "user",
      accountStatus: asString(row.accountStatus) ?? "active",
      joinDate,
      lastActive: normalizeIsoDate(row.lastActive, joinDate),
      presenceStatus: asString(row.presenceStatus) ?? "offline",
      activity:
        asString(row.activity) === "hosting" || asString(row.activity) === "watching"
          ? asString(row.activity)
          : null,
      reportCount: Number.parseInt(asString(row.reportCount), 10) || 0,
      spendTotal:
        row.spendTotal == null
          ? null
          : Number.isFinite(Number.parseFloat(asString(row.spendTotal)))
            ? Number.parseFloat(asString(row.spendTotal))
            : null,
    };
  });

  return {
    users,
    total: Number(countResult.rows[0]?.total ?? 0),
    spendDataAvailable: countResult.rows[0]?.spendDataAvailable === true,
  };
}

function asBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = asString(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function normalizeAssignableAdminRole(value) {
  const normalized = normalizeRoleValue(value);
  if (
    normalized === "user" ||
    normalized === "support" ||
    normalized === "moderator" ||
    normalized === "admin" ||
    normalized === "owner"
  ) {
    return normalized;
  }
  throw new Error("role must be user, support, moderator, admin, or owner.");
}

function getAdminUserDetailPermissions(viewerRole) {
  const normalizedViewerRole = normalizeAdminRole(viewerRole);
  const canManageUsers =
    hasAdminPermission(normalizedViewerRole, ADMIN_PERMISSIONS.BAN_USER) ||
    hasAdminPermission(normalizedViewerRole, ADMIN_PERMISSIONS.MUTE_USER);
  const canAdjustWallet = hasAdminPermission(normalizedViewerRole, ADMIN_PERMISSIONS.EDIT_WALLET);
  const canChangeRoles = hasAdminPermission(normalizedViewerRole, ADMIN_PERMISSIONS.CHANGE_USER_ROLE);
  const canViewEmail = hasAdminPermission(normalizedViewerRole, ADMIN_PERMISSIONS.VIEW_USERS);

  return {
    canManageUsers,
    canAdjustWallet,
    canChangeRoles,
    canViewEmail,
    availableRoles: canChangeRoles ? ["user", "support", "moderator", "admin", "owner"] : [],
  };
}

function buildWalletHistoryFromAuditLog(log) {
  const metadata = safeObject(log?.metadata);
  const normalizedCurrency = asString(metadata.currency).trim().toLowerCase();
  if (normalizedCurrency !== "gems" && normalizedCurrency !== "cash" && normalizedCurrency !== "fuel") {
    return null;
  }

  const amountValue = Number(metadata.amount);
  const safeAmount = Number.isFinite(amountValue) ? Math.abs(Math.floor(amountValue)) : 0;
  const operation = asString(metadata.operation).trim().toLowerCase();
  const delta = emptyWalletDelta();
  const balanceBefore = emptyWalletDelta();
  const balanceAfter = emptyWalletDelta();

  let scalarBefore = 0;
  let scalarAfter = 0;
  const rawBalanceBefore = metadata.balanceBefore;
  const rawBalanceAfter = metadata.balanceAfter;

  if (isRecord(rawBalanceBefore) || isRecord(rawBalanceAfter)) {
    const beforeSnapshot = toWalletSnapshot(rawBalanceBefore);
    const afterSnapshot = toWalletSnapshot(rawBalanceAfter);
    balanceBefore.gems = beforeSnapshot.gems;
    balanceBefore.cash = beforeSnapshot.cash;
    balanceBefore.fuel = beforeSnapshot.fuel;
    balanceAfter.gems = afterSnapshot.gems;
    balanceAfter.cash = afterSnapshot.cash;
    balanceAfter.fuel = afterSnapshot.fuel;
    scalarBefore = beforeSnapshot[normalizedCurrency];
    scalarAfter = afterSnapshot[normalizedCurrency];
  } else {
    scalarBefore = toWalletBalance(rawBalanceBefore);
    scalarAfter = toWalletBalance(rawBalanceAfter);
    balanceBefore[normalizedCurrency] = scalarBefore;
    balanceAfter[normalizedCurrency] = scalarAfter;
  }

  if (operation === "remove" || operation === "debit") {
    delta[normalizedCurrency] = -safeAmount;
  } else if (operation === "set") {
    delta[normalizedCurrency] = scalarAfter - scalarBefore;
  } else {
    delta[normalizedCurrency] = safeAmount;
  }

  return {
    id: `audit-${log.id}`,
    adminUserId: asString(log.actorAdminId),
    reason: asString(log.reason),
    delta,
    balanceBefore,
    balanceAfter,
    createdAt: normalizeIsoDate(log.ts),
    metadata,
  };
}

async function fetchAdminUserDetail(targetUserId, viewerRole) {
  const userResult = await pool.query(
    `
      select
        ${ADMIN_USER_SQL.id} as id,
        ${ADMIN_USER_SQL.username} as username,
        ${ADMIN_USER_SQL.email} as email,
        ${ADMIN_USER_SQL.role} as role,
        ${ADMIN_USER_SQL.accountStatus} as "accountStatus",
        ${ADMIN_USER_SQL.joinDate} as "joinDate",
        ${ADMIN_USER_SQL.lastActive} as "lastActive",
        ${ADMIN_USER_SQL.presenceStatus} as "presenceStatus"
      ${ADMIN_USER_FROM_SQL}
      where ${ADMIN_USER_SQL.id} = $1
      limit 1
    `,
    [targetUserId],
  );

  const userRow = userResult.rows[0] ?? null;
  if (!userRow) {
    return null;
  }

  const [accountRow, socialRow, profileRow, moderationPage, walletTransactionsResult, reportsResult] =
    await Promise.all([
      getAccountStateRow(targetUserId),
      getSocialRow(targetUserId),
      getUserProfileRow(targetUserId),
      listAuditLogsPage({ targetId: targetUserId, page: 1, limit: 25 }),
      pool.query(
        `
          select *
          from admin_wallet_credit_transactions
          where target_user_id = $1
          order by created_at desc
          limit 25
        `,
        [targetUserId],
      ),
      pool.query(
        `
          select *
          from support_tickets
          where user_id = $1
          order by updated_at desc, created_at desc
          limit 25
        `,
        [targetUserId],
      ),
    ]);

  const permissions = getAdminUserDetailPermissions(viewerRole);
  const accountState = safeObject(accountRow?.state);
  const socialState = safeObject(socialRow?.item);
  const profileState = safeObject(profileRow?.profile);
  const walletSnapshot = toWalletSnapshot(accountState.wallet);
  const displayName =
    asString(accountState.displayName).trim() ||
    asString(profileState.displayName).trim() ||
    asString(userRow.username).trim() ||
    targetUserId;
  const moderationHistory = moderationPage.logs.map((entry) => ({
    id: asString(entry.id),
    adminUserId: asString(entry.actorAdminId),
    actionType: asString(entry.actionType),
    targetType: asString(entry.targetType),
    targetId: asString(entry.targetId),
    reason: asString(entry.reason),
    payload: safeObject(entry.metadata),
    createdAt: normalizeIsoDate(entry.ts),
  }));

  const walletTransactionHistory = walletTransactionsResult.rows.map((row) => ({
    id: asString(row.id),
    adminUserId: asString(row.admin_user_id),
    reason: asString(row.reason),
    delta: getWalletDeltaFromTransactionRow(row),
    balanceBefore: toWalletSnapshot(row.balance_before),
    balanceAfter: toWalletSnapshot(row.balance_after),
    createdAt: normalizeIsoDate(row.created_at),
    metadata: safeObject(row.metadata),
  }));

  const walletAuditHistory = moderationPage.logs
    .filter((entry) => asString(entry.actionType) === "WALLET_ADJUST")
    .map(buildWalletHistoryFromAuditLog)
    .filter(Boolean);

  const walletHistory = [...walletTransactionHistory, ...walletAuditHistory]
    .sort((left, right) => {
      const rightTime = Date.parse(right.createdAt);
      const leftTime = Date.parse(left.createdAt);
      return rightTime - leftTime;
    })
    .slice(0, 25);

  const sessionUserAgent =
    asString(accountState.lastUserAgent).trim() ||
    asString(accountState.userAgent).trim() ||
    asString(profileState.userAgent).trim() ||
    null;
  const sessionIp =
    asString(accountState.lastIp).trim() ||
    asString(accountState.ip).trim() ||
    asString(profileState.lastIp).trim() ||
    null;
  const latestKnownSessionTime =
    normalizeIsoDate(userRow.lastActive, normalizeIsoDate(accountRow?.updated_at, new Date().toISOString()));
  const sessions =
    sessionUserAgent || sessionIp || latestKnownSessionTime
      ? [
          {
            id: `${targetUserId}-latest`,
            deviceLabel:
              asString(accountState.deviceLabel).trim() ||
              asString(accountState.currentDevice).trim() ||
              "Latest known session",
            status: asString(userRow.presenceStatus) || "offline",
            lastSeenAt: latestKnownSessionTime,
            userAgent: sessionUserAgent,
            ip: sessionIp,
            isCurrent: false,
          },
        ]
      : [];

  return {
    user: {
      id: asString(userRow.id),
      name: displayName,
      username: asString(userRow.username),
      email: permissions.canViewEmail ? asString(userRow.email) || null : null,
      status: asString(userRow.presenceStatus) || "offline",
      statusText:
        asString(socialState.statusText).trim() ||
        asString(accountState.statusText).trim() ||
        "",
      role: asString(userRow.role) || "user",
      accountStatus: asString(userRow.accountStatus) || "active",
      joinDate: normalizeIsoDate(userRow.joinDate),
      lastActive: normalizeIsoDate(userRow.lastActive),
      avatarUrl:
        asString(socialState.avatarUrl).trim() ||
        asString(profileState.avatarUrl).trim() ||
        null,
      wallet: walletSnapshot,
      moderationFlags: {
        isBanned: asBoolean(accountState.isBanned),
        isMuted: asBoolean(accountState.isMuted),
        isTimedOut: asBoolean(accountState.isTimedOut),
        isShadowbanned: asBoolean(accountState.isShadowbanned),
        bannedAt: accountState.bannedAt ? normalizeIsoDate(accountState.bannedAt) : null,
        bannedReason:
          asString(accountState.bannedReason).trim() ||
          asString(accountState.lastModerationReason).trim() ||
          null,
        mutedUntil: accountState.mutedUntil ? normalizeIsoDate(accountState.mutedUntil) : null,
        timedOutUntil: accountState.timedOutUntil
          ? normalizeIsoDate(accountState.timedOutUntil)
          : null,
      },
    },
    moderationHistory,
    reports: reportsResult.rows.map((row) => ({
      id: asString(row.id),
      category: asString(row.category) || "general",
      priority: asString(row.priority) || "normal",
      status: asString(row.status) || "open",
      assigneeAdminId: asString(row.assignee_admin_id) || null,
      createdAt: normalizeIsoDate(row.created_at),
      updatedAt: normalizeIsoDate(row.updated_at, normalizeIsoDate(row.created_at)),
    })),
    walletHistory,
    sessions,
    permissions,
  };
}

async function fetchSnapshot(viewerUserId) {
  const viewerRolePromise = resolveStoredUserRole(viewerUserId);
  const [
    liveFields,
    socialUsers,
    conversations,
    globalMessages,
    threadSeedMessagesByUserId,
    notifications,
    leaderboardItems,
    videos,
    tracks,
    playlists,
    artists,
    acceptedFriendIds,
    accountStateRow,
  ] = await Promise.all([
    fetchLiveFields(),
    fetchSocialUsers(),
    fetchConversations(viewerUserId),
    viewerRolePromise,
    viewerRolePromise.then((viewerRole) => fetchGlobalMessages(viewerUserId, viewerRole)),
    fetchThreadSeedMessagesByUserId(viewerUserId),
    fetchNotifications(viewerUserId),
    fetchLeaderboardItems(),
    fetchVideos(),
    fetchTracks(),
    fetchPlaylists(),
    fetchArtists(),
    getAcceptedFriendIds(viewerUserId),
    getAccountStateRow(viewerUserId),
  ]);

  const mentionUsers = await fetchMentionUsers(socialUsers);

  return {
    ...liveFields,
    socialUsers,
    acceptedFriendIds,
    conversations,
    globalMessages,
    mentionUsers,
    threadSeedMessagesByUserId,
    notifications,
    leaderboardItems,
    videos,
    tracks,
    playlists,
    artists,
    searchIndex: {
      users: socialUsers,
      conversations,
      lives: liveFields.lives,
    },
    wallet: safeObject(accountStateRow?.state)?.wallet,
  };
}

async function fetchSnapshotPatch(viewerUserId, scopes) {
  const scopeSet = new Set(scopes);
  const patch = {};
  let viewerRole = null;

  let liveFields = null;
  let socialUsers = null;
  let conversations = null;

  if (scopeSet.has("wallet") || scopeSet.has("account")) {
    const accountStateRow = await getAccountStateRow(viewerUserId);
    patch.wallet = safeObject(accountStateRow?.state)?.wallet;
  }

  if (scopeSet.has("live") || scopeSet.has("search")) {
    liveFields = await fetchLiveFields();
    if (scopeSet.has("live")) {
      patch.lives = liveFields.lives;
      patch.boostLeaderboard = liveFields.boostLeaderboard;
      patch.knownLiveUsers = liveFields.knownLiveUsers;
      patch.livePresence = liveFields.livePresence;
    }
  }

  if (scopeSet.has("social") || scopeSet.has("search")) {
    socialUsers = await fetchSocialUsers();
    if (scopeSet.has("social")) {
      patch.socialUsers = socialUsers;
    }
  }

  if (scopeSet.has("friendships")) {
    patch.acceptedFriendIds = await getAcceptedFriendIds(viewerUserId);
  }

  if (scopeSet.has("conversations") || scopeSet.has("search")) {
    conversations = await fetchConversations(viewerUserId);
    if (scopeSet.has("conversations")) {
      patch.conversations = conversations;
    }
  }

  if (scopeSet.has("global_messages")) {
    if (viewerRole == null) {
      viewerRole = await resolveStoredUserRole(viewerUserId);
    }
    patch.globalMessages = await fetchGlobalMessages(viewerUserId, viewerRole);
  }

  if (scopeSet.has("messages")) {
    patch.threadSeedMessagesByUserId = await fetchThreadSeedMessagesByUserId(viewerUserId);
  }

  // Mentions are relatively static; refresh only when explicitly requested.
  if (scopeSet.has("mention_users")) {
    if (!socialUsers) {
      socialUsers = await fetchSocialUsers();
    }
    patch.mentionUsers = await fetchMentionUsers(socialUsers);
  }

  if (scopeSet.has("notifications")) {
    patch.notifications = await fetchNotifications(viewerUserId);
  }

  if (scopeSet.has("leaderboard")) {
    patch.leaderboardItems = await fetchLeaderboardItems();
  }

  if (scopeSet.has("videos")) {
    patch.videos = await fetchVideos();
  }

  if (scopeSet.has("music")) {
    const [tracks, playlists, artists] = await Promise.all([
      fetchTracks(),
      fetchPlaylists(),
      fetchArtists(),
    ]);
    patch.tracks = tracks;
    patch.playlists = playlists;
    patch.artists = artists;
  }

  if (scopeSet.has("search")) {
    if (!socialUsers) {
      socialUsers = await fetchSocialUsers();
    }
    if (!conversations) {
      conversations = await fetchConversations(viewerUserId);
    }
    if (!liveFields) {
      liveFields = await fetchLiveFields();
    }

    patch.searchIndex = {
      users: socialUsers,
      conversations,
      lives: liveFields.lives,
    };
  }

  return patch;
}

app.post(
  "/webhooks/auth",
  asyncRoute(async (req, res) => {
    if (!authWebhookSigningKey || authWebhookSigningKey.length === 0) {
      console.error("[auth/webhook] AUTH_WEBHOOK_SECRET is not configured.");
      res.status(503).json({ error: "Webhook is not configured" });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      console.warn("[auth/webhook] Request body is not raw JSON.");
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    const svixId = asString(req.header("svix-id"));
    const svixTimestamp = asString(req.header("svix-timestamp"));
    const svixSignatureHeader = asString(req.header("svix-signature"));

    const signatureIsValid = isAuthWebhookSignatureValid({
      payloadBuffer: req.body,
      svixId,
      svixTimestamp,
      svixSignatureHeader,
    });

    if (!signatureIsValid) {
      console.warn("[auth/webhook] Signature verification failed", {
        svixId: svixId ?? null,
      });
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      console.warn("[auth/webhook] Failed to parse webhook payload", {
        svixId: svixId ?? null,
      });
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    const event = safeObject(payload);
    const eventType = asString(event.type);
    const eventId = asString(event.id) ?? svixId ?? "unknown";
    const eventData = safeObject(event.data);

    console.info("[auth/webhook] Event received", {
      eventId,
      eventType: eventType ?? "unknown",
    });

    if (eventType === "user.created" || eventType === "user.updated") {
      const upsertResult = await upsertUserFromAuthWebhookPayload(eventData);
      if (!upsertResult) {
        console.warn("[auth/webhook] Missing user id for sync event", {
          eventId,
          eventType,
        });
        res.status(202).json({ ok: true, ignored: true });
        return;
      }

      emitRealtimeDataChanged({
        userIds: [upsertResult.userId],
        scopes: ["social", "search"],
        reason: "auth_user_synced",
      });

      console.info("[auth/webhook] User synced", {
        eventId,
        eventType,
        userId: upsertResult.userId,
      });
      res.json({ ok: true });
      return;
    }

    if (eventType === "user.deleted") {
      const deletedUserId = await deleteUserFromAuthWebhookPayload(eventData);
      if (!deletedUserId) {
        console.warn("[auth/webhook] Missing user id for delete event", {
          eventId,
          eventType,
        });
        res.status(202).json({ ok: true, ignored: true });
        return;
      }

      emitRealtimeDataChanged({
        userIds: [deletedUserId],
        scopes: ["social", "search"],
        reason: "auth_user_deleted",
      });

      console.info("[auth/webhook] User deleted", {
        eventId,
        userId: deletedUserId,
      });
      res.json({ ok: true });
      return;
    }

    console.info("[auth/webhook] Ignored unsupported event", {
      eventId,
      eventType: eventType ?? "unknown",
    });
    res.json({ ok: true, ignored: true });
  }),
);

async function handleAdminUsersRequest(req, res) {
  const page = parsePositiveInteger(req.query.page, 1, 100000);
  const limit = parsePositiveInteger(req.query.limit, 20, 200);
  const queryText = asQueryString(req.query.queryText) || asQueryString(req.query.search);
  const role = asQueryString(req.query.role).trim().toLowerCase();
  const accountStatus =
    (asQueryString(req.query.accountStatus) || asQueryString(req.query.status)).trim().toLowerCase();
  const reportCountMin = parseNullableInteger(
    req.query.reportCountMin ?? req.query.minReportCount ?? req.query.reportsMin,
  );
  const reportCountMax = parseNullableInteger(
    req.query.reportCountMax ?? req.query.maxReportCount ?? req.query.reportsMax,
  );
  const activity = asQueryString(req.query.activity).trim().toLowerCase();
  const spendMin = parseNullableNumber(req.query.spendMin ?? req.query.minSpend);
  const spendMax = parseNullableNumber(req.query.spendMax ?? req.query.maxSpend);
  const sortBy = normalizeAdminUserSortBy(
    asQueryString(req.query.sortBy) || asQueryString(req.query.sort),
  );
  const sortOrder = normalizeSortDirection(
    asQueryString(req.query.sortOrder) || asQueryString(req.query.order),
  );

  const { users, total, spendDataAvailable } = await fetchAdminUsersPage({
    page,
    limit,
    queryText,
    role,
    accountStatus,
    reportCountMin,
    reportCountMax,
    activity,
    spendMin,
    spendMax,
    sortBy,
    sortOrder,
  });

  res.set("x-total-count", String(total));
  res.set("x-page", String(page));
  res.set("x-limit", String(limit));
  res.set("x-spend-data-available", spendDataAvailable ? "true" : "false");
  res.json(users);
}

app.get(
  "/admin/users",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_USERS),
  asyncRoute(handleAdminUsersRequest),
);

app.get(
  "/admin/users/:userId/detail",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_USERS),
  asyncRoute(async (req, res) => {
    const targetUserId = asString(req.params?.userId).trim();
    if (!targetUserId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const userDetail = await fetchAdminUserDetail(targetUserId, req.viewerRole);
    if (!userDetail) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.json({ ok: true, userDetail });
  }),
);

app.post(
  "/admin/users/:userId/role",
  requireAdminPermission(ADMIN_PERMISSIONS.CHANGE_USER_ROLE),
  asyncRoute(async (req, res) => {
    const targetUserId = asString(req.params?.userId).trim();
    const viewerRole = normalizeRoleValue(req.viewerRole);

    if (!targetUserId) {
      const missingUserAudit = buildRequestAuditLog(req, {
        actionType: "ROLE_CHANGE",
        targetType: "user",
        targetId: targetUserId,
        reason: req.body?.reason,
      });
      await insertAuditLog({
        ...missingUserAudit,
        result: "fail",
        errorMessage: "userId is required",
      });
      res.status(400).json({ error: "userId is required" });
      return;
    }

    let reason;
    try {
      reason = normalizeAdminWalletReason(req.body?.reason);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "reason is required.";
      const invalidReasonAudit = buildRequestAuditLog(req, {
        actionType: "ROLE_CHANGE",
        targetType: "user",
        targetId: targetUserId,
        reason: req.body?.reason,
      });
      await insertAuditLog({
        ...invalidReasonAudit,
        result: "fail",
        errorMessage,
      });
      res.status(400).json({ error: errorMessage });
      return;
    }

    const auditBase = buildRequestAuditLog(req, {
      actionType: "ROLE_CHANGE",
      targetType: "user",
      targetId: targetUserId,
      reason,
    });

    if (!(viewerRole === "admin" || viewerRole === "owner" || viewerRole === "superadmin" || viewerRole === "super_admin")) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "Only admin or owner roles can change user roles.",
      });
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let requestedRole;
    try {
      requestedRole = normalizeAssignableAdminRole(req.body?.role);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid role.";
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage,
      });
      res.status(400).json({ error: errorMessage });
      return;
    }

    const ownerLevelViewer =
      viewerRole === "owner" || viewerRole === "superadmin" || viewerRole === "super_admin";
    if (requestedRole === "owner" && !ownerLevelViewer) {
      await insertAuditLog({
        ...auditBase,
        metadata: { requestedRole },
        result: "fail",
        errorMessage: "Only owner-level admins can assign the owner role.",
      });
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const currentResult = await client.query(
        `select state from account_state_items where user_id = $1 limit 1 for update`,
        [targetUserId],
      );
      const currentState = safeObject(currentResult.rows[0]?.state);
      const previousRole = normalizeRoleValue(currentState.role) || "user";
      const nextState = {
        ...currentState,
        role: requestedRole,
        updatedAt: nowMs(),
      };

      await client.query(
        `
          insert into account_state_items (user_id, state, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (user_id)
          do update set state = excluded.state, updated_at = now()
        `,
        [targetUserId, toJson(nextState)],
      );

      const currentProfileResult = await client.query(
        `select profile from user_profile_items where user_id = $1 limit 1 for update`,
        [targetUserId],
      );
      const currentProfile = safeObject(currentProfileResult.rows[0]?.profile);
      const nextProfile = {
        ...currentProfile,
        role: requestedRole,
      };

      await client.query(
        `
          insert into user_profile_items (user_id, profile, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (user_id)
          do update set profile = excluded.profile, updated_at = now()
        `,
        [targetUserId, toJson(nextProfile)],
      );

      await insertAuditLog(
        {
          ...auditBase,
          metadata: {
            previousRole,
            requestedRole,
          },
          result: "success",
        },
        client,
      );

      await client.query("commit");

      emitRealtimeDataChanged({
        userIds: [targetUserId],
        scopes: ["social", "search", "account"],
        reason: "admin_role_changed",
      });

      res.json({
        ok: true,
        role: requestedRole,
      });
    } catch (error) {
      await client.query("rollback");
      await insertAuditLog({
        ...auditBase,
        metadata: {
          requestedRole: req.body?.role,
        },
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Role update failed",
      });
      throw error;
    } finally {
      client.release();
    }
  }),
);


app.post(
  "/admin/wallet/credit",
  requireAdminPermission(ADMIN_PERMISSIONS.EDIT_WALLET),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const targetUserId = asString(req.body?.userId);
    const reason =
      (asString(req.body?.reason) ?? "manual_admin_wallet_credit").slice(
        0,
        MAX_ADMIN_WALLET_CREDIT_REASON_LENGTH,
      );
    const metadata = {
      ip: asString(req.header("x-forwarded-for")) ?? asString(req.ip) ?? null,
      userAgent: asString(req.header("user-agent")) ?? null,
      source: asString(req.body?.source) ?? "admin_api",
    };
    const auditBase = buildRequestAuditLog(req, {
      actionType: "WALLET_CREDIT",
      targetType: "wallet",
      targetId: targetUserId,
      reason,
      metadata,
    });

    if (!targetUserId) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "userId is required",
      });
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const creditPayload = safeObject(req.body?.credit);
    let deltaGems = 0;
    let deltaCash = 0;
    let deltaFuel = 0;

    try {
      deltaGems = parseWalletCreditAmount(creditPayload.gems ?? req.body?.gems, "gems");
      deltaCash = parseWalletCreditAmount(creditPayload.cash ?? req.body?.cash, "cash");
      deltaFuel = parseWalletCreditAmount(creditPayload.fuel ?? req.body?.fuel, "fuel");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Invalid credit payload";
      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...metadata,
          requestedCredit: creditPayload,
        },
        result: "fail",
        errorMessage,
      });
      res.status(400).json({
        error: errorMessage,
      });
      return;
    }

    if (deltaGems === 0 && deltaCash === 0 && deltaFuel === 0) {
      const errorMessage =
        "At least one positive credit amount is required (gems, cash, or fuel).";
      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...metadata,
          delta: {
            gems: deltaGems,
            cash: deltaCash,
            fuel: deltaFuel,
          },
        },
        result: "fail",
        errorMessage,
      });
      res.status(400).json({
        error: errorMessage,
      });
      return;
    }
    const adminUserId = req.viewerUserId;
    const adminRole = asString(req.viewerRole) ?? "admin";

    const client = await pool.connect();
    try {
      await client.query("begin");

      const currentResult = await client.query(
        `select state from account_state_items where user_id = $1 limit 1 for update`,
        [targetUserId],
      );
      const currentState = safeObject(currentResult.rows[0]?.state);
      const currentWallet = safeObject(currentState.wallet);
      const balanceBefore = {
        gems: toWalletBalance(currentWallet.gems),
        cash: toWalletBalance(currentWallet.cash),
        fuel: toWalletBalance(currentWallet.fuel),
      };
      const balanceAfter = {
        gems: balanceBefore.gems + deltaGems,
        cash: balanceBefore.cash + deltaCash,
        fuel: balanceBefore.fuel + deltaFuel,
      };

      const nextState = {
        ...currentState,
        wallet: {
          ...currentWallet,
          ...balanceAfter,
        },
        updatedAt: nowMs(),
      };

      await client.query(
        `
          insert into account_state_items (user_id, state, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (user_id)
          do update set state = excluded.state, updated_at = now()
        `,
        [targetUserId, toJson(nextState)],
      );

      const transactionResult = await client.query(
        `
          insert into admin_wallet_credit_transactions (
            admin_user_id,
            target_user_id,
            delta_gems,
            delta_cash,
            delta_fuel,
            reason,
            balance_before,
            balance_after,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
          returning id, created_at
        `,
        [
          adminUserId,
          targetUserId,
          deltaGems,
          deltaCash,
          deltaFuel,
          reason,
          toJson(balanceBefore),
          toJson(balanceAfter),
          toJson(metadata),
        ],
      );

      const transaction = transactionResult.rows[0] ?? null;
      await insertAuditLog(
        {
          ...auditBase,
          metadata: {
            ...metadata,
            transactionId: asString(transaction?.id) ?? null,
            delta: {
              gems: deltaGems,
              cash: deltaCash,
              fuel: deltaFuel,
            },
            balanceBefore,
            balanceAfter,
          },
          result: "success",
        },
        client,
      );

      await client.query("commit");

      console.info("[admin/wallet-credit] Wallet credited", {
        transactionId: asString(transaction?.id) ?? null,
        adminUserId,
        adminRole,
        targetUserId,
        deltaGems,
        deltaCash,
        deltaFuel,
        reason,
      });

      res.json({
        ok: true,
        transaction: {
          id: asString(transaction?.id) ?? null,
          createdAt: transaction?.created_at ?? null,
          adminUserId,
          adminRole,
          targetUserId,
          reason,
          delta: {
            gems: deltaGems,
            cash: deltaCash,
            fuel: deltaFuel,
          },
          balanceBefore,
          balanceAfter,
        },
      });
    } catch (error) {
      await client.query("rollback");
      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...metadata,
          delta: {
            gems: deltaGems,
            cash: deltaCash,
            fuel: deltaFuel,
          },
        },
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Wallet credit failed",
      });
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/admin/wallet/adjust",
  requireAdminPermission(ADMIN_PERMISSIONS.EDIT_WALLET),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const targetUserId = asString(req.body?.userId);
    const reason =
      (asString(req.body?.reason) ?? "manual_admin_wallet_adjustment").slice(
        0,
        MAX_ADMIN_WALLET_CREDIT_REASON_LENGTH,
      );
    const auditBase = buildRequestAuditLog(req, {
      actionType: "WALLET_ADJUST",
      targetType: "wallet",
      targetId: targetUserId,
      reason,
      metadata: {
        source: asString(req.body?.source) ?? "admin_api",
        requestedOperation: asString(req.body?.operation),
        requestedCurrency: asString(req.body?.currency),
      },
    });

    if (!targetUserId) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "userId is required",
      });
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const operation = asString(req.body?.operation)?.trim().toLowerCase();
    if (!operation || !["add", "remove", "set"].includes(operation)) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "operation must be add, remove, or set.",
      });
      res.status(400).json({ error: "operation must be add, remove, or set." });
      return;
    }

    let currency;
    let amount;
    try {
      currency = normalizeAdminWalletCurrency(req.body?.currency);
      amount = parseAdminWalletAdjustmentAmount(req.body?.amount, {
        allowZero: operation === "set",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Invalid wallet adjustment payload.";
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage,
      });
      res.status(400).json({
        error: errorMessage,
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const currentResult = await client.query(
        `select state from account_state_items where user_id = $1 limit 1 for update`,
        [targetUserId],
      );
      const currentState = safeObject(currentResult.rows[0]?.state);
      const currentWallet = safeObject(currentState.wallet);
      const balanceBefore = toWalletBalance(currentWallet[currency]);

      let balanceAfter = balanceBefore;
      if (operation === "add") {
        balanceAfter = balanceBefore + amount;
      } else if (operation === "remove") {
        if (amount > balanceBefore) {
          await client.query("rollback");
          await insertAuditLog({
            ...auditBase,
            metadata: {
              ...auditBase.metadata,
              operation,
              currency,
              amount,
              balanceBefore,
            },
            result: "fail",
            errorMessage: `${currency} balance cannot go below zero.`,
          });
          res.status(400).json({
            error: `${currency} balance cannot go below zero.`,
          });
          return;
        }
        balanceAfter = balanceBefore - amount;
      } else {
        balanceAfter = amount;
      }

      const nextState = {
        ...currentState,
        wallet: {
          ...currentWallet,
          [currency]: balanceAfter,
        },
        updatedAt: nowMs(),
      };

      await client.query(
        `
          insert into account_state_items (user_id, state, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (user_id)
          do update set state = excluded.state, updated_at = now()
        `,
        [targetUserId, toJson(nextState)],
      );

      await insertAuditLog(
        {
          ...auditBase,
          metadata: {
            ...auditBase.metadata,
            operation,
            currency,
            amount,
            balanceBefore,
            balanceAfter,
          },
          result: "success",
        },
        client,
      );

      await client.query("commit");

      res.json({
        ok: true,
        wallet: {
          userId: targetUserId,
          currency,
          operation,
          amount,
          balanceBefore,
          balanceAfter,
          reason,
        },
      });
    } catch (error) {
      await client.query("rollback");
      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...auditBase.metadata,
          operation,
          currency,
          amount,
        },
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Wallet adjustment failed",
      });
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/admin/wallet/preview",
  requireAdmin,
  asyncRoute(async (req, res) => {
    try {
      const preview = await getAdminWalletPreview(pool, req, req.body);
      res.json({
        ok: true,
        preview: {
          amount: preview.amount,
          balanceAfter: preview.balanceAfter,
          balanceBefore: preview.balanceBefore,
          currency: preview.currency,
          delta: preview.delta,
          metadata: preview.metadata,
          operation: preview.operation,
          reason: preview.reason,
          reversalOfTransactionId: preview.reversalOfTransactionId,
          sourceTransactionId: preview.sourceTransactionId,
          targetUserId: preview.targetUserId,
        },
      });
    } catch (error) {
      if (error instanceof Error && !(error && typeof error === "object" && "code" in error)) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

app.post(
  "/admin/wallet/transaction",
  requireAdmin,
  asyncRoute(async (req, res) => {
    try {
      const transaction = await recordAdminWalletTransaction(req, req.body);
      res.json({ ok: true, transaction });
    } catch (error) {
      if (error instanceof Error && !(error && typeof error === "object" && "code" in error)) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

app.post(
  "/admin/wallet/reverse",
  requireAdmin,
  asyncRoute(async (req, res) => {
    try {
      const transaction = await recordAdminWalletTransaction(req, {
        operation: "reversal",
        reason: req.body?.reason,
        reversalOfTransactionId: req.body?.reversalOfTransactionId,
        userId: req.body?.userId,
      });
      res.json({ ok: true, transaction });
    } catch (error) {
      if (error instanceof Error && !(error && typeof error === "object" && "code" in error)) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

app.get(
  "/admin/withdrawals",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const rawStatus = asString(req.query.status).trim().toLowerCase();
    const statusFilter =
      !rawStatus || rawStatus === "all"
        ? null
        : normalizeWithdrawalWorkflowStatus(rawStatus, "pending");
    const methodFilter = asString(req.query.method).trim().toLowerCase();
    const queryText = (
      asString(req.query.queryText) ||
      asString(req.query.search)
    ).trim().toLowerCase();

    const allRequests = await loadAdminWithdrawalEntries();
    let requests = allRequests;
    if (statusFilter) {
      requests = requests.filter((entry) => entry.status === statusFilter);
    }
    if (methodFilter && methodFilter !== "all") {
      requests = requests.filter((entry) => entry.method.trim().toLowerCase() === methodFilter);
    }
    if (queryText) {
      requests = requests.filter((entry) => {
        return (
          entry.id.toLowerCase().includes(queryText) ||
          entry.userId.toLowerCase().includes(queryText) ||
          entry.userLabel.toLowerCase().includes(queryText) ||
          entry.details.email.toLowerCase().includes(queryText)
        );
      });
    }

    const counts = {
      approved: 0,
      completed: 0,
      denied: 0,
      pending: 0,
      processing: 0,
      total: allRequests.length,
    };
    for (const entry of allRequests) {
      if (typeof counts[entry.status] === "number") {
        counts[entry.status] += 1;
      }
    }

    res.json({
      ok: true,
      counts,
      requests: requests.map((entry) => ({
        amountGems: entry.amountGems,
        amountRealMoney: entry.amountRealMoney,
        id: entry.id,
        method: entry.method,
        noteCount: entry.notes.length,
        requestedAt: entry.requestedAt,
        status: entry.status,
        statusHistoryCount: entry.statusHistory.length,
        userId: entry.userId,
        userLabel: entry.userLabel,
      })),
    });
  }),
);

app.get(
  "/admin/withdrawals/:requestId",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const entry = await getAdminWithdrawalEntry(req.params.requestId);
    if (!entry) {
      res.status(404).json({ error: "Withdrawal request not found." });
      return;
    }

    res.json({
      ok: true,
      request: entry,
    });
  }),
);

app.post(
  "/admin/withdrawals/:requestId/note",
  requireAdmin,
  asyncRoute(async (req, res) => {
    try {
      const request = await appendAdminWithdrawalNote(
        req,
        req.params.requestId,
        req.body?.note,
      );
      res.json({ ok: true, request });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Withdrawal request not found.") {
          res.status(404).json({ error: error.message });
          return;
        }
        if (!(error && typeof error === "object" && "code" in error)) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      throw error;
    }
  }),
);

app.post(
  "/admin/withdrawals/:requestId/review",
  requireAdmin,
  asyncRoute(async (req, res) => {
    try {
      const request = await reviewAdminWithdrawalRequest(
        req,
        req.params.requestId,
        req.body?.decision,
        req.body?.reason,
      );
      res.json({ ok: true, request });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Withdrawal request not found.") {
          res.status(404).json({ error: error.message });
          return;
        }
        if (!(error && typeof error === "object" && "code" in error)) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      throw error;
    }
  }),
);


app.get(
  "/health",
  asyncRoute(async (_req, res) => {
    await pool.query("select 1");
    res.json({ ok: true, service: "vulu-api" });
  }),
);

app.get("/metrics/realtime", (_req, res) => {
  res.json(getRealtimeMetricsSnapshot());
});

app.get(
  "/snapshot",
  requireAuth,
  asyncRoute(async (req, res) => {
    const snapshot = await fetchSnapshot(req.viewerUserId);
    res.json(snapshot);
  }),
);

app.get(
  "/snapshot/patch",
  requireAuth,
  asyncRoute(async (req, res) => {
    const scopes = parseSnapshotScopes(req.query.scopes);
    if (scopes.length === 0) {
      res.json({ patch: {} });
      return;
    }

    const patch = await fetchSnapshotPatch(req.viewerUserId, scopes);
    res.json({ patch });
  }),
);

app.get(
  "/counts/unread",
  requireAuth,
  asyncRoute(async (req, res) => {
    const conversationRows = await pool.query(
      `select item from conversation_items where owner_user_id = $1`,
      [req.viewerUserId],
    );
    const unreadMessages = conversationRows.rows.reduce((sum, row) => {
      const item = safeObject(row.item);
      const unread = typeof item.unreadCount === "number" ? item.unreadCount : 0;
      return sum + Math.max(0, unread);
    }, 0);

    const notificationRows = await pool.query(
      `select item from notification_items where user_id = $1`,
      [req.viewerUserId],
    );
    const unreadNotifications = notificationRows.rows.reduce((sum, row) => {
      const item = safeObject(row.item);
      if (shouldHideNotificationItem(item)) return sum;
      if (item.read === true) return sum;
      return sum + 1;
    }, 0);

    res.json({
      unreadMessages,
      unreadNotifications,
    });
  }),
);

app.get(
  "/music/artists",
  asyncRoute(async (_req, res) => {
    res.json({ items: await fetchArtists() });
  }),
);

app.get(
  "/music/tracks",
  asyncRoute(async (_req, res) => {
    res.json({ items: await fetchTracks() });
  }),
);

app.get(
  "/music/playlists",
  asyncRoute(async (_req, res) => {
    res.json({ items: await fetchPlaylists() });
  }),
);

function resolveObjectExtension(contentType, fallbackExtension) {
  const normalized = asString(contentType)?.toLowerCase() ?? "";
  if (!normalized) return fallbackExtension;
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("quicktime")) return "mov";
  const parts = normalized.split("/");
  const subtype =
    asString(parts[1])
      ?.split(";")[0]
      .trim()
      .replace(/[^a-z0-9.+-]/g, "") ?? "";
  return subtype || fallbackExtension;
}

// Debug endpoint for R2 testing
app.get("/debug/r2", asyncRoute(async (_req, res) => {
  res.json({
    isR2Configured,
    isR2PublicUrlConfigured,
    r2AccountId: !!process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: !!process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: !!process.env.R2_SECRET_ACCESS_KEY,
    r2BucketName: !!process.env.R2_BUCKET_NAME,
    r2PublicBaseUrl: !!process.env.R2_PUBLIC_BASE_URL,
  });
}));

// Test presigned URL generation
app.get("/debug/presigned", asyncRoute(async (_req, res) => {
  try {
    const testKey = "video/test-user/test.mp4";
    const url = await generatePresignedUrl(testKey);
    res.json({
      objectKey: testKey,
      presignedUrl: url,
      hasChecksumHeader: url.includes('x-amz-content-sha256'),
      urlLength: url.length,
      urlStart: url.substring(0, 100) + "..."
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.post(
  "/video/upload/url",
  requireAuth,
  asyncRoute(async (req, res) => {
    console.log("Video upload URL request received");
    console.log("R2 configured:", isR2Configured);
    console.log("R2 public URL configured:", isR2PublicUrlConfigured);

    if (!isR2Configured || !isR2PublicUrlConfigured) {
      console.log("Storage not fully configured");
      res.status(503).json({ error: "Storage is not fully configured" });
      return;
    }

    const contentType = asString(req.body?.contentType);
    if (!contentType) {
      res.status(400).json({ error: "contentType is required" });
      return;
    }
    const extension = resolveObjectExtension(contentType, "mp4");
    const objectKey = `video/${req.viewerUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    const url = await generatePresignedUrl(objectKey);
    const publicUrl = getPublicUrlForObjectKey(objectKey);
    res.json({ url, objectKey, publicUrl });
  }),
);

app.post(
  "/video/items",
  requireAuth,
  asyncRoute(async (req, res) => {
    const title = asString(req.body?.title);
    const description = asString(req.body?.description) || "";
    const videoUrl = asString(req.body?.videoUrl);
    const thumbnailUrl = asString(req.body?.thumbnailUrl) || "";
    const category = asString(req.body?.category) || "Vlog";
    const contentType = asString(req.body?.contentType) || "movie";
    const tags = Array.isArray(req.body?.tags) ? toStringArray(req.body.tags) : [];
    const price = Number(req.body?.price) || 0;
    const currency = asString(req.body?.currency) || "cash";
    const durationSeconds = Number(req.body?.durationSeconds) || 0;

    if (!title || !videoUrl) {
      res.status(400).json({ error: "title and videoUrl are required" });
      return;
    }

    // Get creator info
    const creatorRow = await pool.query(
      `select profile from user_profile_items where user_id = $1 limit 1`,
      [req.viewerUserId]
    );
    const creatorProfile = safeObject(creatorRow.rows[0]?.profile);
    const creatorName = asString(creatorProfile.username) || asString(creatorProfile.name) || "Unknown Creator";
    const creatorAvatar = asString(creatorProfile.imageUrl) || "";

    const id = `v${Date.now()}`;
    const item = {
      id,
      creatorId: req.viewerUserId,
      creatorName,
      creatorAvatar,
      title,
      description,
      thumbnailUrl,
      videoUrl,
      price,
      currency,
      contentType,
      category,
      tags,
      durationSeconds,
      views: 0,
      likes: 0,
      createdAt: Date.now(),
      isLocked: price > 0,
    };

    await pool.query(
      `
        insert into video_items (id, item, updated_at)
        values ($1, $2::jsonb, now())
      `,
      [id, toJson(item)]
    );

    emitRealtimeDataChanged({
      globalPaths: ["/videos"],
      reason: "video_created",
    });

    res.json({ id });
  }),
);

app.post(
  "/music/upload/url",
  requireAuth,
  asyncRoute(async (req, res) => {
    if (!isR2Configured || !isR2PublicUrlConfigured) {
      res.status(503).json({ error: "Storage is not fully configured" });
      return;
    }

    const contentType = asString(req.body?.contentType);
    if (!contentType) {
      res.status(400).json({ error: "contentType is required" });
      return;
    }
    const extension = resolveObjectExtension(contentType, "bin");
    const objectKey = `music/${req.viewerUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    const url = await generatePresignedUrl(objectKey);
    const publicUrl = getPublicUrlForObjectKey(objectKey);
    res.json({ url, objectKey, publicUrl });
  }),
);

app.post(
  "/music/tracks",
  requireAuth,
  asyncRoute(async (req, res) => {
    const title = asString(req.body?.title);
    const artistName = asString(req.body?.artistName);
    const audioUrl = asString(req.body?.audioUrl);
    const artworkUrl = asString(req.body?.artworkUrl) || "";
    const durationSeconds = Number(req.body?.durationSeconds) || 0;

    if (!title || !artistName || !audioUrl) {
      res.status(400).json({ error: "title, artistName, and audioUrl are required" });
      return;
    }

    // Upsert artist
    let artistId;
    const existingArtistResult = await pool.query(
      `select id::text from artists where name = $1 limit 1`,
      [artistName]
    );

    if (existingArtistResult.rows.length > 0) {
      artistId = existingArtistResult.rows[0].id;
    } else {
      const newArtistResult = await pool.query(
        `insert into artists (name, image_url) values ($1, '') returning id::text`,
        [artistName]
      );
      artistId = newArtistResult.rows[0].id;
    }

    // Insert track
    const newTrackResult = await pool.query(
      `
        insert into tracks (title, artist_id, artwork_url, duration_seconds, audio_url)
        values ($1, $2::uuid, $3, $4, $5)
        returning id::text
      `,
      [title, artistId, artworkUrl, durationSeconds, audioUrl]
    );

    res.json({ id: newTrackResult.rows[0].id });
  }),
);

app.post(
  "/messages/thread/send",
  requireAuth,
  asyncRoute(async (req, res) => {
    const senderUserId = req.viewerUserId;
    const otherUserId = asString(req.body?.userId);
    const clientMessageId = asString(req.body?.clientMessageId);
    const rawMessage = req.body?.message;

    if (!otherUserId || otherUserId === senderUserId || !isRecord(rawMessage)) {
      res.json({ ok: true });
      return;
    }

    const senderModerationState = await getMessagingModerationState(senderUserId);
    if (senderModerationState.isBanned) {
      res.status(403).json({ error: "Account is banned." });
      return;
    }
    if (senderModerationState.isTimedOut) {
      res.status(403).json({ error: "User is currently timed out." });
      return;
    }
    if (senderModerationState.isMuted) {
      res.status(403).json({ error: "User is currently muted." });
      return;
    }

    const senderDisplay = await getUserDisplay(senderUserId);
    const message = normalizeMessage(rawMessage, senderUserId, senderDisplay.name, clientMessageId);

    const senderInserted = await appendThreadMessage(senderUserId, otherUserId, message);
    const receiverInserted = await appendThreadMessage(otherUserId, senderUserId, message);

    if (senderInserted) {
      await upsertConversation(senderUserId, otherUserId, message, false);
    }
    if (receiverInserted) {
      await upsertConversation(otherUserId, senderUserId, message, true);
    }

    emitRealtimeDataChanged({
      userIds: [senderUserId, otherUserId],
      scopes: ["messages", "conversations", "counts"],
      reason: "thread_message",
    });

    res.json({ ok: true, messageId: message.id });
  }),
);

app.post(
  "/messages/conversation/mark-read",
  requireAuth,
  asyncRoute(async (req, res) => {
    const ownerUserId = req.viewerUserId;
    const otherUserId = asString(req.body?.userId);
    if (!otherUserId || otherUserId === ownerUserId) {
      res.json({ ok: true });
      return;
    }

    const row = await getConversationRow(ownerUserId, otherUserId);
    let unreadCleared = false;
    if (row) {
      const previousItem = safeObject(row.item);
      const previousUnread =
        typeof previousItem.unreadCount === "number" ? Math.max(0, previousItem.unreadCount) : 0;

      if (previousUnread > 0) {
        unreadCleared = true;
        const nextItem = {
          ...previousItem,
          unreadCount: 0,
          otherUserId,
        };

        await pool.query(
          `
            update conversation_items
            set item = $3::jsonb,
                updated_at = now()
            where owner_user_id = $1
              and other_user_id = $2
          `,
          [ownerUserId, otherUserId, toJson(nextItem)],
        );
      }
    }

    const readAtMs = nowMs();
    const receiptUpdates = await Promise.all([
      markThreadMessagesRead(ownerUserId, otherUserId, otherUserId, readAtMs),
      markThreadMessagesRead(otherUserId, ownerUserId, otherUserId, readAtMs),
      markConversationLastMessageRead(ownerUserId, otherUserId, otherUserId, readAtMs),
      markConversationLastMessageRead(otherUserId, ownerUserId, otherUserId, readAtMs),
    ]);
    const hasReceiptUpdates = receiptUpdates.some((updated) => updated);

    if (unreadCleared || hasReceiptUpdates) {
      emitRealtimeDataChanged({
        userIds: [ownerUserId, otherUserId],
        scopes: ["messages", "conversations", "counts"],
        reason: "conversation_read",
      });
    }

    res.json({ ok: true });
  }),
);

app.post(
  "/messages/global/send",
  requireAuth,
  asyncRoute(async (req, res) => {
    const senderUserId = req.viewerUserId;
    const clientMessageId = asString(req.body?.clientMessageId);
    const rawMessage = req.body?.message;
    const roomId = asString(req.body?.roomId);
    if (!isRecord(rawMessage)) {
      res.json({ ok: true });
      return;
    }

    const senderModerationState = await getMessagingModerationState(senderUserId);
    if (senderModerationState.isBanned) {
      res.status(403).json({ error: "Account is banned." });
      return;
    }
    if (senderModerationState.isTimedOut) {
      res.status(403).json({ error: "User is currently timed out." });
      return;
    }
    if (senderModerationState.isMuted) {
      res.status(403).json({ error: "User is currently muted." });
      return;
    }

    if (roomId) {
      const liveRow = await getLiveRow(roomId);
      if (liveRow) {
        const liveItem = safeObject(liveRow.item);
        const bannedUserIds = normalizeUserIds(liveItem.bannedUserIds);
        if (bannedUserIds.includes(senderUserId)) {
          const removedPresenceResult = await pool.query(
            `delete from live_presence_items where user_id = $1 and item->>'liveId' = $2`,
            [senderUserId, roomId],
          );
          if ((removedPresenceResult.rowCount ?? 0) > 0) {
            emitRealtimeDataChanged({
              scopes: ["live"],
              reason: "live_message_blocked_banned_user",
            });
          }
          res.status(403).json({ error: "Banned from live" });
          return;
        }
      }
    }

    const senderDisplay = await getUserDisplay(senderUserId);
    const message = normalizeMessage(rawMessage, senderUserId, senderDisplay.name, clientMessageId);
    const messageWithRoom = roomId
      ? {
        ...message,
        roomId,
      }
      : message;
    const persistedMessage = senderModerationState.isShadowbanned
      ? {
        ...messageWithRoom,
        moderation: {
          ...safeObject(messageWithRoom.moderation),
          shadowHidden: true,
          shadowbannedAt: nowMs(),
        },
      }
      : messageWithRoom;

    await pool.query(
      `
        insert into global_message_items (id, room_id, item, created_at)
        values ($1, $2, $3::jsonb, $4)
        on conflict (id)
        do update set room_id = excluded.room_id, item = excluded.item, created_at = excluded.created_at
      `,
      [
        asString(persistedMessage.id) ?? `${nowMs()}`,
        roomId ?? null,
        toJson(persistedMessage),
        persistedMessage.createdAt,
      ],
    );

    emitRealtimeDataChanged({
      scopes: ["global_messages"],
      reason: senderModerationState.isShadowbanned ? "global_message_shadow_hidden" : "global_message",
    });

    res.json({
      ok: true,
      messageId: persistedMessage.id,
      shadowHidden: senderModerationState.isShadowbanned,
    });
  }),
);

app.post(
  "/social/update-status",
  requireAuth,
  asyncRoute(async (req, res) => {
    const userId = req.viewerUserId;
    const status = normalizeSocialStatusValue(req.body?.status);
    if (!status) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const socialRow = await getSocialRow(userId);
    const socialItem = safeObject(socialRow?.item);
    const accountState = safeObject((await getAccountStateRow(userId))?.state);
    const requestedStatusText = Object.prototype.hasOwnProperty.call(req.body ?? {}, "statusText")
      ? asString(req.body?.statusText)
      : asString(socialItem.statusText) ?? asString(socialItem.statusMessage);
    const isLive = status === "live";
    const isOnline = socialStatusIsOnline(status);
    const shouldRefreshLastSeen = status === "recent" || status === "offline";

    const nextItem = {
      ...socialItem,
      id: userId,
      username: asString(socialItem.username) ?? deriveUsername(userId, accountState),
      avatarUrl: asString(socialItem.avatarUrl) ?? asString(accountState.avatarUrl) ?? "",
      status,
      isLive,
      isOnline,
      statusText: requestedStatusText ?? "",
      statusMessage: requestedStatusText ?? "",
      lastSeen: shouldRefreshLastSeen
        ? new Date().toISOString()
        : asString(socialItem.lastSeen),
    };

    await upsertSocialRow(userId, nextItem);
    emitRealtimeDataChanged({
      scopes: ["social", "search"],
      reason: "social_status_updated",
    });
    res.json({ ok: true, item: nextItem });
  }),
);

app.post(
  "/social/set-live",
  requireAuth,
  asyncRoute(async (req, res) => {
    const userId = req.viewerUserId;
    const isLive = req.body?.isLive === true;

    const socialRow = await getSocialRow(userId);
    const socialItem = safeObject(socialRow?.item);
    const accountState = safeObject((await getAccountStateRow(userId))?.state);
    const currentStatus = resolveSocialStatusFromItem(socialItem);
    const previousStatus =
      normalizeSocialStatusValue(socialItem.previousStatus) ??
      (currentStatus !== "live" ? currentStatus : "online");
    const nextStatus = isLive ? "live" : previousStatus;

    const nextItem = {
      ...socialItem,
      id: userId,
      username: asString(socialItem.username) ?? deriveUsername(userId, accountState),
      avatarUrl: asString(socialItem.avatarUrl) ?? asString(accountState.avatarUrl) ?? "",
      status: nextStatus,
      previousStatus: isLive ? previousStatus : undefined,
      isLive: nextStatus === "live",
      isOnline: socialStatusIsOnline(nextStatus),
      statusText: asString(socialItem.statusText) ?? asString(socialItem.statusMessage) ?? "",
      statusMessage: asString(socialItem.statusText) ?? asString(socialItem.statusMessage) ?? "",
      lastSeen:
        nextStatus === "recent" || nextStatus === "offline"
          ? new Date().toISOString()
          : asString(socialItem.lastSeen),
    };

    await upsertSocialRow(userId, nextItem);
    emitRealtimeDataChanged({
      scopes: ["social", "search"],
      reason: "social_live_toggled",
    });
    res.json({ ok: true, item: nextItem });
  }),
);

app.post(
  "/social/delete",
  requireAuth,
  asyncRoute(async (req, res) => {
    const viewerUserId = req.viewerUserId;
    const requestedUserId = asString(req.body?.userId);
    const userId = requestedUserId ?? viewerUserId;
    if (userId !== viewerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await Promise.all([
      pool.query(`delete from social_user_items where user_id = $1`, [userId]),
      pool.query(`delete from live_presence_items where user_id = $1`, [userId]),
    ]);

    emitRealtimeDataChanged({
      scopes: ["social", "live"],
      reason: "social_user_deleted",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/live/start",
  requireAuth,
  asyncRoute(async (req, res) => {
    const ownerUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    const hasRequestedTitle = typeof req.body?.title === "string";
    const requestedTitle = hasRequestedTitle ? normalizeLiveTitle(req.body?.title, "") : undefined;
    if (!liveId) {
      res.status(400).json({ error: "liveId is required" });
      return;
    }

    const existingRow = await getLiveRow(liveId);
    const existingItem = safeObject(existingRow?.item);
    const existingOwnerUserId = asString(existingItem.ownerUserId);
    if (existingOwnerUserId && existingOwnerUserId !== ownerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const requestedHosts = normalizeLiveHosts(req.body?.hosts);
    const existingHosts = normalizeLiveHosts(existingItem.hosts);
    const hosts =
      requestedHosts.length > 0
        ? requestedHosts
        : existingHosts.length > 0
          ? existingHosts
          : await buildDefaultLiveHosts(ownerUserId);
    const bannedUserIds = normalizeUserIds(req.body?.bannedUserIds ?? existingItem.bannedUserIds);
    const createdAt =
      typeof existingItem.createdAt === "number" && Number.isFinite(existingItem.createdAt)
        ? existingItem.createdAt
        : nowMs();
    const nextItem = {
      ...existingItem,
      id: liveId,
      ownerUserId,
      title: hasRequestedTitle ? requestedTitle : normalizeLiveTitle(existingItem.title, ""),
      viewers: parseLiveViewerCount(req.body?.viewers, parseLiveViewerCount(existingItem.viewers, 0)),
      boosted: existingItem.boosted === true,
      inviteOnly:
        typeof req.body?.inviteOnly === "boolean"
          ? req.body.inviteOnly
          : existingItem.inviteOnly === true,
      images: hosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
      hosts,
      bannedUserIds,
      createdAt,
      updatedAt: nowMs(),
    };

    await upsertLiveRow(liveId, nextItem);
    emitRealtimeDataChanged({
      scopes: ["live"],
      reason: "live_started",
    });
    res.json({ ok: true, item: nextItem });
  }),
);

app.post(
  "/live/update",
  requireAuth,
  asyncRoute(async (req, res) => {
    const ownerUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    if (!liveId) {
      res.status(400).json({ error: "liveId is required" });
      return;
    }

    const existingRow = await getLiveRow(liveId);
    const existingItem = safeObject(existingRow?.item);
    const existingOwnerUserId = asString(existingItem.ownerUserId);
    if (existingOwnerUserId && existingOwnerUserId !== ownerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const requestedHosts = normalizeLiveHosts(req.body?.hosts);
    const existingHosts = normalizeLiveHosts(existingItem.hosts);
    const hasRequestedTitle = typeof req.body?.title === "string";
    const requestedTitle = hasRequestedTitle ? normalizeLiveTitle(req.body?.title, "") : undefined;
    const hosts =
      requestedHosts.length > 0
        ? requestedHosts
        : existingHosts.length > 0
          ? existingHosts
          : await buildDefaultLiveHosts(ownerUserId);
    const bannedUserIds = normalizeUserIds(req.body?.bannedUserIds ?? existingItem.bannedUserIds);
    const createdAt =
      typeof existingItem.createdAt === "number" && Number.isFinite(existingItem.createdAt)
        ? existingItem.createdAt
        : nowMs();

    const nextItem = {
      ...existingItem,
      id: liveId,
      ownerUserId: existingOwnerUserId ?? ownerUserId,
      title: hasRequestedTitle ? requestedTitle : normalizeLiveTitle(existingItem.title, ""),
      viewers: parseLiveViewerCount(req.body?.viewers, parseLiveViewerCount(existingItem.viewers, 0)),
      boosted: existingItem.boosted === true,
      inviteOnly:
        typeof req.body?.inviteOnly === "boolean"
          ? req.body.inviteOnly
          : existingItem.inviteOnly === true,
      images: hosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
      hosts,
      bannedUserIds,
      createdAt,
      updatedAt: nowMs(),
    };

    await upsertLiveRow(liveId, nextItem);
    emitRealtimeDataChanged({
      scopes: ["live"],
      reason: "live_updated",
    });
    res.json({ ok: true, item: nextItem });
  }),
);

app.post(
  "/live/ban",
  requireAuth,
  asyncRoute(async (req, res) => {
    const actorUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    const targetUserId = asString(req.body?.targetUserId);

    if (!liveId || !targetUserId) {
      res.status(400).json({ error: "liveId and targetUserId are required" });
      return;
    }

    if (targetUserId === actorUserId) {
      res.status(400).json({ error: "Cannot ban yourself" });
      return;
    }

    const liveRow = await getLiveRow(liveId);
    if (!liveRow) {
      res.status(404).json({ error: "Live not found" });
      return;
    }

    const liveItem = safeObject(liveRow.item);
    const ownerUserId = asString(liveItem.ownerUserId);
    const hostUserIdSet = new Set(
      normalizeLiveHosts(liveItem.hosts)
        .map((host) => asString(host.id))
        .filter(Boolean),
    );
    if (ownerUserId) {
      hostUserIdSet.add(ownerUserId);
    }

    if (hostUserIdSet.size > 0 && !hostUserIdSet.has(actorUserId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (ownerUserId && targetUserId === ownerUserId) {
      res.status(400).json({ error: "Cannot ban the live owner" });
      return;
    }

    const existingBannedUserIds = normalizeUserIds(liveItem.bannedUserIds);
    const alreadyBanned = existingBannedUserIds.includes(targetUserId);
    const nextBannedUserIds = alreadyBanned
      ? existingBannedUserIds
      : [...existingBannedUserIds, targetUserId];

    const existingHosts = normalizeLiveHosts(liveItem.hosts);
    let nextHosts = existingHosts.filter((host) => asString(host.id) !== targetUserId);
    if (nextHosts.length === 0 && ownerUserId && ownerUserId !== targetUserId) {
      nextHosts = await buildDefaultLiveHosts(ownerUserId);
    }

    const createdAt =
      typeof liveItem.createdAt === "number" && Number.isFinite(liveItem.createdAt)
        ? liveItem.createdAt
        : nowMs();
    const baselineViewerCount = parseLiveViewerCount(liveItem.viewers, 0);
    const nextViewerCount = alreadyBanned
      ? baselineViewerCount
      : Math.max(0, baselineViewerCount - 1);

    const nextItem = {
      ...liveItem,
      id: liveId,
      ownerUserId: ownerUserId ?? actorUserId,
      title: normalizeLiveTitle(liveItem.title, ""),
      inviteOnly: liveItem.inviteOnly === true,
      boosted: liveItem.boosted === true,
      viewers: nextViewerCount,
      hosts: nextHosts,
      images: nextHosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
      bannedUserIds: nextBannedUserIds,
      createdAt,
      updatedAt: nowMs(),
    };

    await upsertLiveRow(liveId, nextItem);
    const removedPresenceResult = await pool.query(
      `delete from live_presence_items where user_id = $1 and item->>'liveId' = $2`,
      [targetUserId, liveId],
    );

    emitRealtimeDataChanged({
      scopes: ["live"],
      reason: alreadyBanned
        ? "live_ban_refreshed"
        : (removedPresenceResult.rowCount ?? 0) > 0
          ? "live_user_banned_and_removed"
          : "live_user_banned",
    });

    res.json({ ok: true, alreadyBanned, item: nextItem });
  }),
);

app.post(
  "/live/unban",
  requireAuth,
  asyncRoute(async (req, res) => {
    const actorUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    const targetUserId = asString(req.body?.targetUserId);

    if (!liveId || !targetUserId) {
      res.status(400).json({ error: "liveId and targetUserId are required" });
      return;
    }

    const liveRow = await getLiveRow(liveId);
    if (!liveRow) {
      res.status(404).json({ error: "Live not found" });
      return;
    }

    const liveItem = safeObject(liveRow.item);
    const ownerUserId = asString(liveItem.ownerUserId);
    const hostUserIdSet = new Set(
      normalizeLiveHosts(liveItem.hosts)
        .map((host) => asString(host.id))
        .filter(Boolean),
    );
    if (ownerUserId) {
      hostUserIdSet.add(ownerUserId);
    }

    if (hostUserIdSet.size > 0 && !hostUserIdSet.has(actorUserId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const existingBannedUserIds = normalizeUserIds(liveItem.bannedUserIds);
    const wasBanned = existingBannedUserIds.includes(targetUserId);
    const nextBannedUserIds = existingBannedUserIds.filter((userId) => userId !== targetUserId);

    const nextItem = {
      ...liveItem,
      id: liveId,
      ownerUserId: ownerUserId ?? actorUserId,
      title: normalizeLiveTitle(liveItem.title, ""),
      inviteOnly: liveItem.inviteOnly === true,
      boosted: liveItem.boosted === true,
      hosts: normalizeLiveHosts(liveItem.hosts),
      bannedUserIds: nextBannedUserIds,
      updatedAt: nowMs(),
    };
    nextItem.images = nextItem.hosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0);

    await upsertLiveRow(liveId, nextItem);

    emitRealtimeDataChanged({
      scopes: ["live"],
      reason: wasBanned ? "live_user_unbanned" : "live_unban_refreshed",
    });

    res.json({ ok: true, wasBanned, item: nextItem });
  }),
);

app.post(
  "/live/end",
  requireAuth,
  asyncRoute(async (req, res) => {
    const ownerUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    if (!liveId) {
      res.status(400).json({ error: "liveId is required" });
      return;
    }

    const existingRow = await getLiveRow(liveId);
    if (existingRow) {
      const existingItem = safeObject(existingRow.item);
      const existingOwnerUserId = asString(existingItem.ownerUserId);
      if (existingOwnerUserId && existingOwnerUserId !== ownerUserId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [deletedLiveResult, deletedPresenceResult] = await Promise.all([
      pool.query(`delete from live_items where id = $1`, [liveId]),
      pool.query(`delete from live_presence_items where user_id = $1 and item->>'liveId' = $2`, [
        ownerUserId,
        liveId,
      ]),
    ]);

    if ((deletedLiveResult.rowCount ?? 0) > 0 || (deletedPresenceResult.rowCount ?? 0) > 0) {
      emitRealtimeDataChanged({
        scopes: ["live"],
        reason: "live_ended",
      });
    }

    res.json({ ok: true });
  }),
);

app.post(
  "/live/invite",
  requireAuth,
  asyncRoute(async (req, res) => {
    const inviterUserId = req.viewerUserId;
    const liveId = asString(req.body?.liveId);
    const targetUserId = asString(req.body?.targetUserId);

    if (!liveId || !targetUserId) {
      res.status(400).json({ error: "liveId and targetUserId are required" });
      return;
    }
    if (targetUserId === inviterUserId) {
      res.status(400).json({ error: "Cannot invite yourself" });
      return;
    }

    const liveRow = await getLiveRow(liveId);
    if (!liveRow) {
      res.status(404).json({ error: "Live not found" });
      return;
    }

    const liveItem = safeObject(liveRow.item);
    const ownerUserId = asString(liveItem.ownerUserId);
    const hostUserIdSet = new Set(
      normalizeLiveHosts(liveItem.hosts)
        .map((host) => asString(host.id))
        .filter(Boolean),
    );
    if (ownerUserId) {
      hostUserIdSet.add(ownerUserId);
    }

    if (hostUserIdSet.size > 0 && !hostUserIdSet.has(inviterUserId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const inviterDisplay = await getUserDisplay(inviterUserId);
    const liveTitle = normalizeLiveTitle(liveItem.title, "");
    const createdAt = nowMs();
    const notificationItem = {
      type: "activity",
      activityType: "live_invite",
      createdAt,
      read: false,
      fromUser: {
        id: inviterDisplay.id,
        name: inviterDisplay.name,
        avatar: inviterDisplay.avatar,
      },
      message:
        liveTitle.length > 0
          ? `invited you to join "${liveTitle}".`
          : "invited you to join a live.",
      metadata: {
        type: "open_live",
        liveId,
        roomId: liveId,
        inviterUserId,
      },
    };

    await pool.query(
      `
        insert into notification_items (user_id, item, created_at)
        values ($1, $2::jsonb, $3)
      `,
      [targetUserId, toJson(notificationItem), createdAt],
    );

    emitRealtimeDataChanged({
      userIds: [targetUserId],
      scopes: ["notifications"],
      reason: "live_invite",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/live/presence",
  requireAuth,
  asyncRoute(async (req, res) => {
    const userId = req.viewerUserId;
    const activity = asString(req.body?.activity);
    const liveId = asString(req.body?.liveId);
    const liveTitle = asString(req.body?.liveTitle);

    if (!activity || !["hosting", "watching", "none"].includes(activity)) {
      res.status(400).json({ error: "Invalid activity" });
      return;
    }

    const existingPresenceRows = await pool.query(
      `select item from live_presence_items where user_id = $1 limit 1`,
      [userId],
    );
    const hasExistingPresence = existingPresenceRows.rows.length > 0;
    const previousPresence = normalizeLivePresenceItem(existingPresenceRows.rows[0]?.item);

    if (activity === "none") {
      let updatedHostedLive = false;
      if (hasExistingPresence) {
        await pool.query(`delete from live_presence_items where user_id = $1`, [userId]);
      }

      const previousLiveId = previousPresence?.liveId;
      if (previousLiveId) {
        const hostedLiveRow = await getLiveRow(previousLiveId);
        if (hostedLiveRow) {
          const hostedLiveItem = safeObject(hostedLiveRow.item);
          const ownerUserId = asString(hostedLiveItem.ownerUserId);

          const existingHosts = normalizeLiveHosts(hostedLiveItem.hosts);
          const filteredHosts = existingHosts.filter((host) => asString(host.id) !== userId);

          const additionalHostingRows = await pool.query(
            `
              select user_id, item
              from live_presence_items
              where item->>'liveId' = $1
                and item->>'activity' = 'hosting'
                and user_id <> $2
              order by updated_at desc
              limit 40
            `,
            [previousLiveId, userId],
          );
          const additionalHostIds = [];
          for (const row of additionalHostingRows.rows) {
            const presenceItem = normalizeLivePresenceItem(row.item);
            const hostUserId = asString(presenceItem?.userId) ?? asString(row.user_id);
            if (!hostUserId || hostUserId === userId) continue;
            if (additionalHostIds.includes(hostUserId)) continue;
            additionalHostIds.push(hostUserId);
          }

          const remainingHostIds = new Set(
            filteredHosts
              .map((host) => asString(host.id))
              .filter(Boolean),
          );
          for (const additionalHostId of additionalHostIds) {
            remainingHostIds.add(additionalHostId);
          }

          if (remainingHostIds.size === 0) {
            await pool.query(`delete from live_items where id = $1`, [previousLiveId]);
            updatedHostedLive = true;
          } else {
            const nextOwnerUserId =
              (ownerUserId && remainingHostIds.has(ownerUserId) ? ownerUserId : null) ??
              filteredHosts.map((host) => asString(host.id)).find(Boolean) ??
              additionalHostIds.find(Boolean);
            if (nextOwnerUserId) {
              let nextHosts = filteredHosts.filter((host) => {
                const hostId = asString(host.id);
                return hostId ? remainingHostIds.has(hostId) : false;
              });
              if (nextHosts.length === 0) {
                nextHosts = await buildDefaultLiveHosts(nextOwnerUserId);
              }

              const nextItem = {
                ...hostedLiveItem,
                ownerUserId: nextOwnerUserId,
                hosts: nextHosts,
                images: nextHosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
                updatedAt: nowMs(),
              };
              await upsertLiveRow(previousLiveId, nextItem);
              updatedHostedLive = true;
            }
          }
          if (!updatedHostedLive && filteredHosts.length !== existingHosts.length) {
            const nextItem = {
              ...hostedLiveItem,
              hosts: filteredHosts,
              images: filteredHosts.map((host) => host.avatar).filter((avatar) => avatar.length > 0),
              updatedAt: nowMs(),
            };
            await upsertLiveRow(previousLiveId, nextItem);
            updatedHostedLive = true;
          }
        }
      }

      if (hasExistingPresence || updatedHostedLive) {
        emitRealtimeDataChanged({
          scopes: ["live"],
          reason: updatedHostedLive ? "live_host_left" : "live_presence_cleared",
        });
      }
      res.json({ ok: true });
      return;
    }

    if (!liveId) {
      res.status(400).json({ error: "liveId is required" });
      return;
    }

    const liveRow = await getLiveRow(liveId);
    if (liveRow) {
      const liveItem = safeObject(liveRow.item);
      const bannedUserIds = normalizeUserIds(liveItem.bannedUserIds);
      if (bannedUserIds.includes(userId)) {
        const removedPresenceResult = await pool.query(
          `delete from live_presence_items where user_id = $1 and item->>'liveId' = $2`,
          [userId, liveId],
        );
        if ((removedPresenceResult.rowCount ?? 0) > 0) {
          emitRealtimeDataChanged({
            scopes: ["live"],
            reason: "live_presence_blocked_banned_user",
          });
        }
        res.status(403).json({ error: "Banned from live" });
        return;
      }
    }

    const item = {
      userId,
      activity,
      liveId,
      liveTitle: activity === "hosting" && liveTitle ? liveTitle.slice(0, 80) : undefined,
      updatedAt: nowMs(),
    };

    await pool.query(
      `
        insert into live_presence_items (user_id, item, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (user_id)
        do update set item = excluded.item, updated_at = now()
      `,
      [userId, toJson(item)],
    );

    const hasMeaningfulPresenceChange =
      !previousPresence ||
      previousPresence.activity !== activity ||
      previousPresence.liveId !== liveId ||
      (activity === "hosting" &&
        (asString(previousPresence.liveTitle) ?? "") !==
        (asString(item.liveTitle) ?? ""));
    if (hasMeaningfulPresenceChange) {
      emitRealtimeDataChanged({
        scopes: ["live"],
        reason: "live_presence_updated",
      });
    }

    res.json({ ok: true, item });
  }),
);

app.post(
  "/notifications/mark-read",
  requireAuth,
  asyncRoute(async (req, res) => {
    const notificationId = asString(req.body?.notificationId);
    if (!notificationId) {
      res.json({ ok: true });
      return;
    }

    const rows = await pool.query(
      `
        select id, item
        from notification_items
        where user_id = $1
          and item->>'id' = $2
        limit 1
      `,
      [req.viewerUserId, notificationId],
    );

    const row = rows.rows[0];
    if (!row) {
      res.json({ ok: true });
      return;
    }

    const item = safeObject(row.item);
    await pool.query(
      `update notification_items set item = $2::jsonb where id = $1`,
      [row.id, toJson({ ...item, read: true })],
    );

    emitRealtimeDataChanged({
      userIds: [req.viewerUserId],
      scopes: ["notifications", "counts"],
      reason: "notification_read",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/notifications/mark-all-read",
  requireAuth,
  asyncRoute(async (req, res) => {
    const rows = await pool.query(
      `select id, item from notification_items where user_id = $1`,
      [req.viewerUserId],
    );

    await Promise.all(
      rows.rows.map(async (row) => {
        const item = safeObject(row.item);
        if (item.read === true) return;
        await pool.query(
          `update notification_items set item = $2::jsonb where id = $1`,
          [row.id, toJson({ ...item, read: true })],
        );
      }),
    );

    emitRealtimeDataChanged({
      userIds: [req.viewerUserId],
      scopes: ["notifications", "counts"],
      reason: "notifications_read_all",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/notifications/delete",
  requireAuth,
  asyncRoute(async (req, res) => {
    const notificationId = asString(req.body?.notificationId);
    if (!notificationId) {
      res.json({ ok: true });
      return;
    }

    await pool.query(
      `
        delete from notification_items
        where user_id = $1
          and item->>'id' = $2
      `,
      [req.viewerUserId, notificationId],
    );

    emitRealtimeDataChanged({
      userIds: [req.viewerUserId],
      scopes: ["notifications", "counts"],
      reason: "notification_deleted",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/notifications/respond-friend-request",
  requireAuth,
  asyncRoute(async (req, res) => {
    const notificationId = asString(req.body?.notificationId);
    const status = asString(req.body?.status);
    if (!notificationId || !status || !["accepted", "declined"].includes(status)) {
      res.json({ ok: true });
      return;
    }

    const viewerUserId = req.viewerUserId;

    const rows = await pool.query(
      `
        select id, item
        from notification_items
        where user_id = $1
          and item->>'id' = $2
        limit 1
      `,
      [viewerUserId, notificationId],
    );

    const row = rows.rows[0];
    if (!row) {
      res.json({ ok: true });
      return;
    }

    const item = safeObject(row.item);
    const fromUser = safeObject(item.fromUser);
    const requesterUserId = asString(fromUser.id);

    await pool.query(
      `update notification_items set item = $2::jsonb where id = $1`,
      [row.id, toJson({ ...item, status, read: true })],
    );

    if (!requesterUserId) {
      res.json({ ok: true });
      return;
    }

    await upsertFriendship({
      userAId: viewerUserId,
      userBId: requesterUserId,
      status,
      requestedBy: status === "accepted" ? undefined : requesterUserId,
    });

    const requesterRows = await pool.query(
      `select id, item from notification_items where user_id = $1`,
      [requesterUserId],
    );

    for (const requesterRow of requesterRows.rows) {
      const requesterItem = safeObject(requesterRow.item);
      if (requesterItem.type !== "friend_request") continue;
      if (requesterItem.direction !== "sent") continue;
      if (requesterItem.status !== "pending") continue;
      const counterpartId = asString(safeObject(requesterItem.fromUser).id);
      if (counterpartId !== viewerUserId) continue;

      await pool.query(
        `update notification_items set item = $2::jsonb where id = $1`,
        [requesterRow.id, toJson({ ...requesterItem, status, read: false })],
      );
      break;
    }

    if (status === "accepted") {
      const ensurePresence = async (userId) => {
        const row = await getSocialRow(userId);
        if (row) return;
        const display = await getUserDisplay(userId);
        await upsertSocialRow(userId, {
          id: userId,
          username: display.name,
          avatarUrl: display.avatar,
          isLive: false,
          isOnline: true,
        });
      };

      await ensurePresence(viewerUserId);
      await ensurePresence(requesterUserId);
    }

    emitRealtimeDataChanged({
      userIds: [viewerUserId, requesterUserId],
      scopes: ["notifications", "counts", "friendships", "social"],
      reason: "friend_request_response",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/notifications/send-friend-request",
  requireAuth,
  asyncRoute(async (req, res) => {
    const fromUserId = req.viewerUserId;
    const toUserId = asString(req.body?.toUserId);

    if (!toUserId || toUserId === fromUserId) {
      res.json({ ok: true });
      return;
    }

    const pair = getFriendshipPair(fromUserId, toUserId);
    const existingFriendshipResult = await pool.query(
      `select status from friendships where pair_key = $1 limit 1`,
      [pair.pairKey],
    );
    const existingStatus = asString(existingFriendshipResult.rows[0]?.status);
    if (existingStatus === "accepted" || existingStatus === "pending") {
      res.json({ ok: true });
      return;
    }

    const existingRows = await pool.query(
      `select item from notification_items where user_id = $1`,
      [toUserId],
    );
    const hasPendingAlready = existingRows.rows.some((row) => {
      const item = safeObject(row.item);
      if (item.type !== "friend_request") return false;
      if (item.status !== "pending") return false;
      const fromId = asString(safeObject(item.fromUser).id);
      return fromId === fromUserId;
    });
    if (hasPendingAlready) {
      res.json({ ok: true });
      return;
    }

    const [fromUser, toUser] = await Promise.all([
      getUserDisplay(fromUserId),
      getUserDisplay(toUserId),
    ]);

    const timestamp = nowMs();
    const requestId = `friend-request-${fromUserId}-${toUserId}-${timestamp}`;
    const senderCopyId = `${requestId}-sender`;

    await pool.query(
      `insert into notification_items (user_id, item, created_at) values ($1, $2::jsonb, $3)`,
      [
        toUserId,
        toJson({
          id: requestId,
          type: "friend_request",
          createdAt: timestamp,
          read: false,
          fromUser,
          direction: "received",
          status: "pending",
        }),
        timestamp,
      ],
    );

    await pool.query(
      `insert into notification_items (user_id, item, created_at) values ($1, $2::jsonb, $3)`,
      [
        fromUserId,
        toJson({
          id: senderCopyId,
          type: "friend_request",
          createdAt: timestamp,
          read: true,
          fromUser: toUser,
          direction: "sent",
          status: "pending",
        }),
        timestamp,
      ],
    );

    await upsertFriendship({
      userAId: fromUserId,
      userBId: toUserId,
      status: "pending",
      requestedBy: fromUserId,
    });

    emitRealtimeDataChanged({
      userIds: [fromUserId, toUserId],
      scopes: ["notifications", "counts", "friendships"],
      reason: "friend_request_sent",
    });

    res.json({ ok: true });
  }),
);

app.post(
  "/notifications/remove-friend-relationship",
  requireAuth,
  asyncRoute(async (req, res) => {
    const viewerUserId = req.viewerUserId;
    const otherUserId = asString(req.body?.otherUserId);

    if (!otherUserId || otherUserId === viewerUserId) {
      res.json({ ok: true });
      return;
    }

    const removeMatchingRows = async (ownerUserId, counterpartUserId) => {
      const rows = await pool.query(`select id, item from notification_items where user_id = $1`, [
        ownerUserId,
      ]);

      await Promise.all(
        rows.rows.map(async (row) => {
          const item = safeObject(row.item);
          if (item.type !== "friend_request") return;
          const fromUserId = asString(safeObject(item.fromUser).id);
          if (fromUserId !== counterpartUserId) return;
          await pool.query(`delete from notification_items where id = $1`, [row.id]);
        }),
      );
    };

    await removeMatchingRows(viewerUserId, otherUserId);
    await removeMatchingRows(otherUserId, viewerUserId);
    await deleteFriendship(viewerUserId, otherUserId);

    emitRealtimeDataChanged({
      userIds: [viewerUserId, otherUserId],
      scopes: ["notifications", "counts", "friendships", "social"],
      reason: "friend_relationship_removed",
    });

    res.json({ ok: true });
  }),
);

app.get(
  "/profile",
  requireAuth,
  asyncRoute(async (req, res) => {
    const requestedUserId = asString(req.query.userId);
    const userId = requestedUserId ?? req.viewerUserId;

    const [profileResult, socialRow] = await Promise.all([
      pool.query(`select profile from user_profile_items where user_id = $1 limit 1`, [userId]),
      getSocialRow(userId),
    ]);
    const profile = safeObject(profileResult.rows[0]?.profile);
    const socialItem = safeObject(socialRow?.item);
    const resolvedSocialStatus = resolveSocialStatusFromItem(socialItem);
    const derivedPresenceStatus =
      resolvedSocialStatus === "busy"
        ? "busy"
        : resolvedSocialStatus === "live" || resolvedSocialStatus === "online"
          ? "online"
          : "offline";
    const socialStatusMessage = asString(socialItem.statusText) ?? asString(socialItem.statusMessage);

    res.json({
      profile: {
        id: userId,
        ...profile,
        presenceStatus: asString(profile.presenceStatus) || derivedPresenceStatus,
        statusMessage: asString(profile.statusMessage) ?? socialStatusMessage ?? undefined,
      },
    });
  }),
);

app.post(
  "/profile/update",
  requireAuth,
  asyncRoute(async (req, res) => {
    const viewerUserId = req.viewerUserId;
    const requestedUserId = asString(req.body?.userId);
    const userId = requestedUserId ?? viewerUserId;
    if (userId !== viewerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updates = safeObject(req.body?.updates);

    const currentRow = await pool.query(
      `select profile from user_profile_items where user_id = $1 limit 1`,
      [userId],
    );
    const currentProfile = safeObject(currentRow.rows[0]?.profile);
    const nextProfile = {
      ...currentProfile,
      ...updates,
      id: userId,
    };

    await upsertUserProfile(userId, nextProfile);

    const hasPresenceStatusUpdate = Object.prototype.hasOwnProperty.call(updates, "presenceStatus");
    const hasStatusMessageUpdate = Object.prototype.hasOwnProperty.call(updates, "statusMessage");

    if (hasPresenceStatusUpdate || hasStatusMessageUpdate) {
      const socialRow = await getSocialRow(userId);
      const socialItem = safeObject(socialRow?.item);
      const accountState = safeObject((await getAccountStateRow(userId))?.state);

      const currentStatus = resolveSocialStatusFromItem(socialItem);
      const requestedPresenceStatus = asString(updates.presenceStatus).toLowerCase();
      const mappedStatus =
        requestedPresenceStatus === "online" ||
          requestedPresenceStatus === "busy" ||
          requestedPresenceStatus === "offline"
          ? requestedPresenceStatus
          : currentStatus;

      const currentStatusText =
        asString(socialItem.statusText) ?? asString(socialItem.statusMessage) ?? "";
      const nextStatusText = hasStatusMessageUpdate
        ? asString(updates.statusMessage) ?? ""
        : currentStatusText;

      const nextSocialItem = {
        ...socialItem,
        id: userId,
        username:
          asString(socialItem.username) ??
          asString(nextProfile.username) ??
          deriveUsername(userId, accountState),
        avatarUrl:
          asString(socialItem.avatarUrl) ??
          asString(nextProfile.avatarUrl) ??
          asString(accountState.avatarUrl) ??
          "",
        status: mappedStatus,
        isLive: mappedStatus === "live",
        isOnline: socialStatusIsOnline(mappedStatus),
        statusText: nextStatusText,
        statusMessage: nextStatusText,
        lastSeen:
          mappedStatus === "offline" || mappedStatus === "recent"
            ? new Date().toISOString()
            : asString(socialItem.lastSeen),
      };

      await upsertSocialRow(userId, nextSocialItem);
      emitRealtimeDataChanged({
        scopes: ["social", "search"],
        reason: "profile_status_updated",
      });
    }

    res.json({ ok: true, profile: nextProfile });
  }),
);

app.get(
  "/account/state",
  requireAuth,
  asyncRoute(async (req, res) => {
    const requestedUserId = asString(req.query.userId);
    const userId = requestedUserId ?? req.viewerUserId;
    if (userId !== req.viewerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const stateRow = await getAccountStateRow(userId);
    res.json({
      state: safeObject(stateRow?.state),
    });
  }),
);

app.post(
  "/account/state/upsert",
  requireAuth,
  asyncRoute(async (req, res) => {
    const viewerUserId = req.viewerUserId;
    const requestedUserId = asString(req.body?.userId);
    const userId = requestedUserId ?? viewerUserId;
    if (userId !== viewerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updates = safeObject(req.body?.updates);
    const currentRow = await getAccountStateRow(userId);
    const currentState = safeObject(currentRow?.state);

    const nextState = {
      ...currentState,
      ...updates,
      wallet: {
        ...safeObject(currentState.wallet),
        ...safeObject(updates.wallet),
      },
      updatedAt: nowMs(),
    };

    await upsertAccountState(userId, nextState);

    res.json({ ok: true, state: nextState });
  }),
);

app.post(
  "/account/state/delete",
  requireAuth,
  asyncRoute(async (req, res) => {
    const viewerUserId = req.viewerUserId;
    const requestedUserId = asString(req.body?.userId);
    const userId = requestedUserId ?? viewerUserId;
    if (userId !== viewerUserId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await pool.query(`delete from account_state_items where user_id = $1`, [userId]);

    res.json({ ok: true });
  }),
);

app.get(
  "/admin/audit_logs",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_AUDIT_LOGS),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const pageResult = await listAuditLogsPage({
      actionType: req.query.actionType,
      actor: req.query.actor,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      targetId: req.query.targetId,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ ok: true, ...pageResult });
  }),
);

app.post(
  "/admin/audit_logs",
  requireAdminRole(["OWNER", "ADMIN", "MODERATOR", "SUPPORT"]),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const adminRole = normalizeAdminRole(req.viewerRole);

    const actionType = asString(req.body?.actionType);
    const targetType = asString(req.body?.targetType) || "system";
    const targetId = asString(req.body?.targetId);
    if (!actionType || !targetType) {
      res.status(400).json({ error: "Missing required audit fields" });
      return;
    }

    const log = await insertAuditLog(
      buildRequestAuditLog(req, {
        actorRole: adminRole,
        actionType,
        targetType,
        targetId,
        reason: req.body?.reason,
        metadata: req.body?.metadata ?? req.body?.payload,
        result: req.body?.result,
        errorMessage: req.body?.errorMessage,
      }),
    );

    res.json({ ok: true, log });
  }),
);

app.get(
  "/admin/moderation/permissions",
  requireAdminRole(["OWNER", "ADMIN", "MODERATOR", "SUPPORT"]),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const normalizedRole = normalizeAdminRole(req.viewerRole);
    res.json({
      ok: true,
      role: normalizedRole,
      permissions: serializeAdminPermissions(normalizedRole),
    });
  }),
);

app.get(
  "/admin/moderation/messages",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_MESSAGE_LOGS),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;

    const scope = normalizeModerationScope(req.query.scope, "all");
    const permissions = serializeAdminPermissions(req.viewerRole);
    if (scope === "dm" && !permissions.canViewDms) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const dateFromIso = parseOptionalIsoDate(req.query.dateFrom ?? req.query.startAt);
    const dateToIso = parseOptionalIsoDate(req.query.dateTo ?? req.query.endAt);
    const messages = await listModerationMessages({
      scope,
      keyword: req.query.keyword,
      userFilter: req.query.user ?? req.query.userId,
      startAtMs: dateFromIso ? Date.parse(dateFromIso) : Number.NaN,
      endAtMs: dateToIso ? Date.parse(dateToIso) : Number.NaN,
      flaggedState: req.query.flaggedState,
      viewerRole: req.viewerRole,
      limit: parsePositiveInteger(req.query.limit, 100, 250),
    });

    await insertAuditLog(
      buildRequestAuditLog(req, {
        actionType: "VIEW_MESSAGE_LOGS",
        targetType: "message",
        targetId: scope,
        reason: "Viewed moderation message logs",
        metadata: {
          scope,
          keyword: asString(req.query.keyword),
          user: asString(req.query.user ?? req.query.userId),
          dateFrom: dateFromIso,
          dateTo: dateToIso,
          flaggedState: normalizeFlaggedStateFilter(req.query.flaggedState),
          resultCount: messages.length,
        },
      }),
    );

    res.json({
      ok: true,
      role: normalizeAdminRole(req.viewerRole),
      permissions,
      messages,
    });
  }),
);

app.get(
  "/admin/moderation/messages/:messageId",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_MESSAGE_LOGS),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;

    const messageId = asString(req.params?.messageId).trim();
    const scope = normalizeModerationScope(req.query.scope, "all");
    const permissions = serializeAdminPermissions(req.viewerRole);
    if (!messageId) {
      res.status(400).json({ error: "Message id is required." });
      return;
    }
    if (scope === "dm" && !permissions.canViewDms) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const message = (
      await listModerationMessages({
        scope,
        keyword: "",
        userFilter: "",
        startAtMs: Number.NaN,
        endAtMs: Number.NaN,
        flaggedState: "all",
        viewerRole: req.viewerRole,
        limit: 500,
      })
    ).find((entry) => asString(entry.id) === messageId);

    if (!message) {
      res.status(404).json({ error: "Message not found." });
      return;
    }

    await insertAuditLog(
      buildRequestAuditLog(req, {
        actionType: "VIEW_MESSAGE_DETAIL",
        targetType: "message",
        targetId: messageId,
        reason: "Viewed moderation message detail",
        metadata: {
          scope: message.scope,
          contextKey: asString(message.contextKey),
        },
      }),
    );

    res.json({
      ok: true,
      role: normalizeAdminRole(req.viewerRole),
      permissions,
      message,
    });
  }),
);

app.post(
  "/admin/exports/estimate",
  requireAdminPermission(ADMIN_EXPORT_PERMISSION),
  asyncRoute(async (req, res) => {
    const resourceType = normalizeAdminExportResource(
      req.body?.resourceType ?? req.body?.resource,
    );
    if (!resourceType) {
      res.status(400).json({ error: "Unsupported export resource." });
      return;
    }

    const filters = sanitizeAdminExportFilters(resourceType, req.body?.filters);
    const estimatedCount = await countAdminExportRows(resourceType, filters);

    res.json({
      ok: true,
      resourceType,
      filters,
      estimatedCount,
    });
  }),
);

app.post(
  "/admin/exports",
  requireAdminPermission(ADMIN_EXPORT_PERMISSION),
  asyncRoute(async (req, res) => {
    const resourceType = normalizeAdminExportResource(
      req.body?.resourceType ?? req.body?.resource,
    );
    const exportFormat = normalizeAdminExportFormat(
      req.body?.exportFormat ?? req.body?.format,
    );

    if (!resourceType) {
      res.status(400).json({ error: "Unsupported export resource." });
      return;
    }
    if (!exportFormat) {
      res.status(400).json({ error: "Unsupported export format." });
      return;
    }

    const filters = sanitizeAdminExportFilters(resourceType, req.body?.filters);
    const estimatedCount = await countAdminExportRows(resourceType, filters);
    const downloadToken = randomUUID();

    const insertResult = await pool.query(
      `
        insert into admin_exports (
          admin_user_id,
          resource_type,
          export_format,
          filters,
          estimated_count,
          status,
          progress,
          download_token,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4::jsonb, $5, 'queued', 10, $6, now(), now())
        returning *
      `,
      [
        req.viewerUserId,
        resourceType,
        exportFormat,
        toJson(filters),
        estimatedCount,
        downloadToken,
      ],
    );

    const exportRow = insertResult.rows[0];
    await insertAuditLog({
      actorAdminId: req.viewerUserId,
      actorRole: req.viewerRole,
      actionType: "EXPORT_DATA",
      targetType: "export",
      targetId: asString(exportRow?.id),
      reason: `Export requested for ${resourceType}`,
      metadata: {
        resourceType,
        exportFormat,
        estimatedCount,
        filters,
      },
    });

    setImmediate(() => {
      void processAdminExportJob(asString(exportRow?.id));
    });

    res.status(202).json({
      ok: true,
      export: serializeAdminExportRecord(exportRow, req),
    });
  }),
);

app.get(
  "/admin/exports/:id",
  requireAdminPermission(ADMIN_EXPORT_PERMISSION),
  asyncRoute(async (req, res) => {
    const exportId = asString(req.params?.id).trim();
    if (!exportId) {
      res.status(400).json({ error: "Export id is required." });
      return;
    }

    const result = await pool.query(
      `select * from admin_exports where id = $1 and admin_user_id = $2 limit 1`,
      [exportId, req.viewerUserId],
    );
    const exportRow = result.rows[0];
    if (!exportRow) {
      res.status(404).json({ error: "Export not found." });
      return;
    }

    res.json({
      ok: true,
      export: serializeAdminExportRecord(exportRow, req),
    });
  }),
);

app.get(
  "/admin/exports/:id/download",
  requireAdminPermission(ADMIN_EXPORT_PERMISSION),
  asyncRoute(async (req, res) => {
    const exportId = asString(req.params?.id).trim();
    const token = asString(req.query?.token).trim();
    if (!exportId) {
      res.status(400).json({ error: "Export id is required." });
      return;
    }

    const result = await pool.query(
      `select * from admin_exports where id = $1 and admin_user_id = $2 limit 1`,
      [exportId, req.viewerUserId],
    );
    const exportRow = result.rows[0];
    if (!exportRow) {
      res.status(404).json({ error: "Export not found." });
      return;
    }

    if (!safeTextCompare(token, exportRow.download_token)) {
      res.status(403).json({ error: "Invalid export token." });
      return;
    }

    if (asString(exportRow.status) !== "completed" || !asString(exportRow.file_body)) {
      res.status(409).json({ error: "Export is not ready yet." });
      return;
    }

    res.setHeader(
      "Content-Type",
      asString(exportRow.content_type) || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asString(exportRow.file_name) || `export-${exportId}`}"`,
    );
    res.send(asString(exportRow.file_body));
  }),
);

app.post(
  "/admin/moderate/user",
  requireAdminRole(["OWNER", "ADMIN", "MODERATOR"]),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const { userId, action, duration, reason } = req.body || {};
    const normalizedUserId = asString(userId);
    const normalizedAction = normalizeModerationUserAction(action);
    const requiredPermission =
      normalizedAction === "ban" || normalizedAction === "shadowban"
        ? ADMIN_PERMISSIONS.BAN_USER
        : normalizedAction === "mute" || normalizedAction === "timeout"
          ? ADMIN_PERMISSIONS.MUTE_USER
          : null;
    const auditBase = buildRequestAuditLog(req, {
      actionType: "MODERATE_USER",
      targetType: "user",
      targetId: normalizedUserId,
      reason,
      metadata: {
        moderationAction: normalizedAction || asString(action),
        duration: duration ?? null,
      },
    });

    if (!normalizedUserId || !normalizedAction) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "Missing userId or unsupported action.",
      });
      res.status(400).json({ error: "Missing userId or unsupported action." });
      return;
    }

    if (!requiredPermission || !hasAdminPermission(req.viewerRole, requiredPermission)) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "Forbidden",
      });
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const state = await moderateUserAccount({
        adminUserId: req.viewerUserId,
        userId: normalizedUserId,
        action: normalizedAction,
        durationMs: duration,
        reason,
      });

      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...auditBase.metadata,
          state,
        },
        result: "success",
      });
      await insertModerationActionEntry({
        adminUserId: req.viewerUserId,
        targetType: "user",
        targetId: normalizedUserId,
        actionType: normalizedAction,
        reason: asString(reason),
        payload: {
          duration,
          state,
        },
      });

      res.json({ ok: true, action: normalizedAction, state });
    } catch (error) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "User moderation failed",
      });
      throw error;
    }
  }),
);

app.post(
  "/admin/moderate/message",
  requireAdminPermission(ADMIN_PERMISSIONS.MODERATE_MESSAGES),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const { messageId, leaveTombstone, reason, scope, conversationUserIds } = req.body || {};
    const normalizedMessageId = asString(messageId);
    const normalizedScope = normalizeModerationScope(scope, "global");
    const trimmedReason = asString(reason).trim();
    const normalizedConversationUserIds = safeArray(conversationUserIds)
      .map((userId) => asString(userId))
      .filter(Boolean);

    if (
      normalizedScope === "dm" &&
      !hasAdminPermission(req.viewerRole, ADMIN_PERMISSIONS.VIEW_DMS)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const auditBase = buildRequestAuditLog(req, {
      actionType: leaveTombstone ? "MODERATE_MESSAGE_TOMBSTONE" : "MODERATE_MESSAGE_DELETE",
      targetType: "message",
      targetId: normalizedMessageId,
      reason: trimmedReason,
      metadata: {
        leaveTombstone: Boolean(leaveTombstone),
        scope: normalizedScope,
        conversationUserIds: normalizedConversationUserIds,
      },
    });

    if (!normalizedMessageId) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "Missing messageId",
      });
      res.status(400).json({ error: "Missing messageId" });
      return;
    }
    if (!trimmedReason) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "A reason is required.",
      });
      res.status(400).json({ error: "A reason is required." });
      return;
    }

    try {
      if (normalizedScope === "dm") {
        await moderateDirectMessage({
          adminUserId: req.viewerUserId,
          messageId: normalizedMessageId,
          conversationUserIds: normalizedConversationUserIds,
          leaveTombstone: Boolean(leaveTombstone),
          reason: trimmedReason,
        });
      } else {
        await moderateGlobalMessage({
          adminUserId: req.viewerUserId,
          messageId: normalizedMessageId,
          leaveTombstone: Boolean(leaveTombstone),
          reason: trimmedReason,
        });
      }

      await insertAuditLog({
        ...auditBase,
        result: "success",
      });
      await insertModerationActionEntry({
        adminUserId: req.viewerUserId,
        targetType: "message",
        targetId: normalizedMessageId,
        actionType: leaveTombstone ? "tombstone" : "delete",
        reason: trimmedReason,
        payload: {
          leaveTombstone: Boolean(leaveTombstone),
          scope: normalizedScope,
          conversationUserIds:
            normalizedScope === "dm" ? normalizedConversationUserIds : undefined,
        },
      });

      res.json({ ok: true, messageId: normalizedMessageId, scope: normalizedScope });
    } catch (error) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Message moderation failed",
      });
      throw error;
    }
  }),
);

app.post(
  "/admin/live/end",
  requireAdminPermission(ADMIN_PERMISSIONS.MANAGE_SYSTEM),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const liveId = asString(req.body?.liveId);
    const trimmedReason = asString(req.body?.reason).trim();
    const auditBase = buildRequestAuditLog(req, {
      actionType: "END_STREAM",
      targetType: "live",
      targetId: liveId,
      reason: trimmedReason,
    });

    if (!liveId) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "liveId is required",
      });
      res.status(400).json({ error: "liveId is required" });
      return;
    }

    try {
      const existingRow = await getLiveRow(liveId);
      if (!existingRow) {
        await insertAuditLog({
          ...auditBase,
          result: "fail",
          errorMessage: "Live stream not found.",
        });
        res.status(404).json({ error: "Live stream not found." });
        return;
      }

      const existingItem = safeObject(existingRow.item);
      const [deletedLiveResult, deletedPresenceResult] = await Promise.all([
        pool.query(`delete from live_items where id = $1`, [liveId]),
        pool.query(`delete from live_presence_items where item->>'liveId' = $1`, [liveId]),
      ]);

      if ((deletedLiveResult.rowCount ?? 0) > 0 || (deletedPresenceResult.rowCount ?? 0) > 0) {
        emitRealtimeDataChanged({
          scopes: ["live"],
          reason: "admin_live_ended",
        });
      }

      const removedPresenceCount = deletedPresenceResult.rowCount ?? 0;

      await insertAuditLog({
        ...auditBase,
        metadata: {
          removedLiveCount: deletedLiveResult.rowCount ?? 0,
          removedPresenceCount,
          hostUserId:
            asOptionalString(existingItem.ownerUserId) ??
            asOptionalString(existingItem.userId) ??
            null,
          hostUsername: asOptionalString(existingItem.username) ?? null,
        },
        result: "success",
      });

      res.json({
        ok: true,
        liveId,
        removedPresenceCount,
      });
    } catch (error) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Unable to end live stream.",
      });
      throw error;
    }
  }),
);

app.post(
  "/admin/messages/clear",
  requireAdminPermission(ADMIN_PERMISSIONS.MANAGE_SYSTEM),
  asyncRoute(async (req, res) => {
    req.skipAutoAdminAudit = true;
    const roomId = (asString(req.body?.roomId) ?? "global").trim().toLowerCase() || "global";
    const trimmedReason = asString(req.body?.reason).trim();
    const auditBase = buildRequestAuditLog(req, {
      actionType: roomId === "global" ? "CLEAR_GLOBAL_CHAT" : "CLEAR_CHAT_ROOM",
      targetType: "message-room",
      targetId: roomId,
      reason: trimmedReason,
      metadata: {
        roomId,
      },
    });

    try {
      const result = await pool.query(
        `
          delete from global_message_items
          where coalesce(nullif(lower(trim(room_id)), ''), 'global') = $1
        `,
        [roomId],
      );

      if ((result.rowCount ?? 0) > 0) {
        emitRealtimeDataChanged({
          scopes: ["global_messages"],
          reason: "admin_messages_cleared",
        });
      }

      await insertAuditLog({
        ...auditBase,
        metadata: {
          ...auditBase.metadata,
          deletedCount: result.rowCount ?? 0,
        },
        result: "success",
      });

      res.json({
        ok: true,
        roomId,
        deletedCount: result.rowCount ?? 0,
      });
    } catch (error) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Unable to clear messages.",
      });
      throw error;
    }
  }),
);

app.post(
  "/admin/moderate/report",
  requireAdminPermission(ADMIN_PERMISSIONS.MODERATE_MESSAGES),
  asyncRoute(async (req, res) => {
    const { reportId, scope, messageId, reportedUserId, contextKey, reason } = req.body || {};
    const normalizedScope = normalizeModerationScope(scope, "global");
    const normalizedReason = asString(reason).trim();
    const effectiveReportId =
      asString(reportId) || buildSyntheticReportId(normalizedScope, asString(messageId));
    const auditBase = buildRequestAuditLog(req, {
      actionType: "ESCALATE_REPORT",
      targetType: "report",
      targetId: effectiveReportId,
      reason: normalizedReason,
      metadata: {
        scope: normalizedScope,
        messageId: asString(messageId) || null,
        reportedUserId: asString(reportedUserId) || null,
        contextKey: asString(contextKey) || null,
      },
    });

    if (
      normalizedScope === "dm" &&
      !hasAdminPermission(req.viewerRole, ADMIN_PERMISSIONS.VIEW_DMS)
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!normalizedReason) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: "A reason is required.",
      });
      res.status(400).json({ error: "A reason is required." });
      return;
    }

    try {
      const escalation = await escalateModerationReport({
        adminUserId: req.viewerUserId,
        reportId: effectiveReportId,
        scope: normalizedScope,
        messageId,
        reportedUserId,
        contextKey,
        reason: normalizedReason,
      });

      await insertModerationActionEntry({
        adminUserId: req.viewerUserId,
        targetType: "report",
        targetId: escalation.reportId,
        actionType: "escalate",
        reason: normalizedReason,
        payload: {
          scope: normalizedScope,
          messageId: asString(messageId) || null,
          reportedUserId: asString(reportedUserId) || null,
          linkedTicketId: escalation.linkedTicketId,
        },
      });

      res.json({ ok: true, ...escalation });
    } catch (error) {
      await insertAuditLog({
        ...auditBase,
        result: "fail",
        errorMessage: error instanceof Error ? error.message : "Report escalation failed",
      });
      throw error;
    }
  }),
);

app.get(
  "/api/admin/system-health",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_SYSTEM_HEALTH),
  asyncRoute(async (_req, res) => {
    const checkedAt = new Date().toISOString();
    let dbLatencyMs = null;
    const dbStartedAt = nowMs();

    try {
      await pool.query("select 1");
      dbLatencyMs = Number((nowMs() - dbStartedAt).toFixed(2));
    } catch (error) {
      console.warn("[admin] system health db check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const requestHealth = getHttpRequestHealthSnapshot();

    res.json({
      checkedAt,
      apiStatus: dbLatencyMs === null ? "degraded" : "operational",
      dbLatencyMs,
      queueSize: null,
      activeSessions: getActiveRealtimeConnectionCount(),
      errorRate: requestHealth.rate,
      errorWindowMs: requestHealth.windowMs,
      sampledRequests: requestHealth.requestCount,
      sampledErrors: requestHealth.errorCount,
    });
  }),
);

app.post(
  "/api/admin/system/snapshot",
  requireAdminPermission(ADMIN_PERMISSIONS.TRIGGER_SNAPSHOT),
  asyncRoute(async (_req, res) => {
    res.status(501).json({ error: "Snapshot trigger is not connected yet." });
  }),
);

app.post(
  "/api/admin/events/config",
  requireAdminPermission(ADMIN_PERMISSIONS.EDIT_EVENT_CONFIG),
  asyncRoute(async (_req, res) => {
    res.status(501).json({ error: "Event configuration updates are not connected yet." });
  }),
);

app.post(
  "/api/admin/content/unpublish",
  requireAdminPermission(ADMIN_PERMISSIONS.UNPUBLISH_CONTENT),
  asyncRoute(async (_req, res) => {
    res.status(501).json({ error: "Content unpublish is not connected yet." });
  }),
);

app.get(
  "/api/admin/incidents",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_INCIDENT_CENTER),
  asyncRoute(async (req, res) => {
    res.json({
      ...getIncidentCenterSnapshot(req.viewerRole),
      checkedAt: new Date().toISOString(),
    });
  }),
);

app.post(
  "/api/admin/incidents/maintenance-mode",
  requireAdminPermission(ADMIN_PERMISSIONS.MANAGE_SYSTEM),
  asyncRoute(async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    if (typeof body.enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }

    const nextMessage = asString(body.message).trim();
    adminIncidentCenterState.maintenanceMode = {
      enabled: body.enabled,
      message: nextMessage,
      updatedAt: new Date().toISOString(),
      updatedBy: asString(req.viewerUserId) || null,
    };

    const recentAlert = recordAdminAlert({
      title: body.enabled ? "Maintenance mode enabled" : "Maintenance mode disabled",
      message:
        nextMessage ||
        (body.enabled
          ? "Administrative maintenance mode is active."
          : "Administrative maintenance mode has been cleared."),
      severity: body.enabled ? "warning" : "success",
      kind: "maintenance",
      createdBy: req.viewerUserId,
      broadcast: true,
    });

    res.json({
      ok: true,
      recentAlert,
      ...getIncidentCenterSnapshot(req.viewerRole),
    });
  }),
);

app.post(
  "/api/admin/incidents/broadcast",
  requireAdminPermission(ADMIN_PERMISSIONS.BROADCAST_ALERT),
  asyncRoute(async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    const title = asString(body.title).trim();
    const message = asString(body.message).trim();
    const markAsOngoing = Boolean(body.markAsOngoing);

    if (!title || !message) {
      res.status(400).json({ error: "title and message are required" });
      return;
    }

    const recentAlert = recordAdminAlert({
      title,
      message,
      severity: body.severity,
      kind: markAsOngoing ? "incident" : "broadcast",
      createdBy: req.viewerUserId,
      broadcast: true,
    });

    if (markAsOngoing) {
      adminIncidentCenterState.ongoingIncident = { ...recentAlert };
    }

    res.json({
      ok: true,
      recentAlert,
      ...getIncidentCenterSnapshot(req.viewerRole),
    });
  }),
);

app.post(
  "/api/admin/incidents/resolve",
  requireAdminPermission(ADMIN_PERMISSIONS.MANAGE_SYSTEM),
  asyncRoute(async (req, res) => {
    const currentIncident = cloneIncidentAlert(adminIncidentCenterState.ongoingIncident);
    adminIncidentCenterState.ongoingIncident = null;

    const recentAlert = currentIncident
      ? recordAdminAlert({
        title: "Incident resolved",
        message: `Resolved: ${currentIncident.title}`,
        severity: "success",
        kind: "incident",
        createdBy: req.viewerUserId,
        broadcast: true,
      })
      : null;

    res.json({
      ok: true,
      recentAlert,
      ...getIncidentCenterSnapshot(req.viewerRole),
    });
  }),
);

// --- Support Tickets Admin Endpoints ---

app.get(
  "/api/admin/tickets",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS),
  asyncRoute(async (req, res) => {
    const rawStatus = asString(req.query.status);
    const rawPriority = asString(req.query.priority);
    const assigneeAdminId = asString(req.query.assigneeAdminId);
    const status = rawStatus
      ? normalizeSupportTicketStatus(rawStatus, null)
      : null;
    const priority = rawPriority
      ? normalizeSupportTicketPriority(rawPriority, "")
      : "";

    if (rawStatus && !status) {
      return res.status(400).json({ error: "Invalid ticket status filter" });
    }

    if (rawPriority && priority !== rawPriority.trim().toLowerCase()) {
      return res.status(400).json({ error: "Invalid ticket priority filter" });
    }

    let query = "SELECT * FROM support_tickets WHERE 1=1";
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }
    if (priority) {
      query += ` AND priority = $${paramIndex++}`;
      values.push(priority);
    }
    if (assigneeAdminId) {
      query += ` AND assignee_admin_id = $${paramIndex++}`;
      values.push(assigneeAdminId);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, values);
    res.json({ tickets: result.rows.map((row) => serializeSupportTicketRow(row)) });
  }),
);

app.get(
  "/api/admin/tickets/:id",
  requireAdminPermission(ADMIN_PERMISSIONS.VIEW_SUPPORT_TICKETS),
  asyncRoute(async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM support_tickets WHERE id = $1 LIMIT 1",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ticket: serializeSupportTicketRow(result.rows[0]) });
  }),
);

app.post(
  "/api/admin/tickets/:id/status",
  requireAdminPermission(ADMIN_PERMISSIONS.RESOLVE_TICKET),
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { status, reason } = safeObject(req.body);
    const nextStatus = normalizeSupportTicketStatus(status, null);
    const reasonText = asString(reason).trim();

    if (!nextStatus || !reasonText) {
      return res.status(400).json({ error: "Missing status or reason" });
    }

    const adminId = asString(req.viewerUserId) || null;
    const changedAt = new Date().toISOString();

    const result = await pool.query(
      `UPDATE support_tickets
       SET status = $1,
           status_history = status_history || jsonb_build_array(
             jsonb_build_object(
               'id', gen_random_uuid()::text,
               'fromStatus', status,
               'toStatus', $1,
               'reason', $2,
               'adminId', $3,
               'createdAt', $4
             )
           ),
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [nextStatus, reasonText, adminId, changedAt, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ok: true, ticket: serializeSupportTicketRow(result.rows[0]) });
  }),
);

app.post(
  "/api/admin/tickets/:id/assign",
  requireAdminPermission(ADMIN_PERMISSIONS.ASSIGN_TICKET),
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { assigneeAdminId } = safeObject(req.body);

    const result = await pool.query(
      `UPDATE support_tickets
       SET assignee_admin_id = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [asString(assigneeAdminId) || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ok: true, ticket: serializeSupportTicketRow(result.rows[0]) });
  }),
);

app.post(
  "/api/admin/tickets/:id/notes",
  requireAdminPermission(ADMIN_PERMISSIONS.ADD_TICKET_NOTE),
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { note } = safeObject(req.body);
    const noteText = asString(note).trim();

    if (!noteText) {
      return res.status(400).json({ error: "Missing note" });
    }

    const adminId = asString(req.viewerUserId) || null;
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      `UPDATE support_tickets
       SET notes = notes || jsonb_build_array(
             jsonb_build_object(
               'id', gen_random_uuid()::text,
               'body', $1,
               'adminId', $2,
               'createdAt', $3
             )
           ),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [noteText, adminId, createdAt, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ok: true, ticket: serializeSupportTicketRow(result.rows[0]) });
  }),
);

app.post(
  "/api/admin/tickets/:id/priority",
  requireAdminPermission(ADMIN_PERMISSIONS.SET_TICKET_PRIORITY),
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { priority } = safeObject(req.body);
    const nextPriority = normalizeSupportTicketPriority(priority, "");

    if (!nextPriority || nextPriority !== asString(priority).trim().toLowerCase()) {
      return res.status(400).json({ error: "Invalid ticket priority" });
    }

    const result = await pool.query(
      `UPDATE support_tickets
       SET priority = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [nextPriority, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ok: true, ticket: serializeSupportTicketRow(result.rows[0]) });
  }),
);

app.post(
  "/api/admin/tickets/bulk-resolve",
  requireAdminPermission(ADMIN_PERMISSIONS.BULK_RESOLVE_TICKETS),
  asyncRoute(async (req, res) => {
    const { ticketIds, reason } = safeObject(req.body);
    const ids = safeArray(ticketIds).map(asString).filter(Boolean);
    const reasonText = asString(reason).trim();

    if (ids.length === 0 || !reasonText) {
      return res.status(400).json({ error: "Missing ticketIds or reason" });
    }

    const adminId = asString(req.viewerUserId) || null;
    const changedAt = new Date().toISOString();

    const result = await pool.query(
      `UPDATE support_tickets
       SET status = 'resolved',
           status_history = status_history || jsonb_build_array(
             jsonb_build_object(
               'id', gen_random_uuid()::text,
               'fromStatus', status,
               'toStatus', 'resolved',
               'reason', $1,
               'adminId', $2,
               'createdAt', $3
             )
           ),
           updated_at = now()
       WHERE id = ANY($4::uuid[])
       RETURNING *`,
      [reasonText, adminId, changedAt, ids],
    );

    res.json({
      ok: true,
      tickets: result.rows.map((row) => serializeSupportTicketRow(row)),
    });
  }),
);

app.post(
  "/api/admin/tickets/bulk-assign",
  requireAdminPermission(ADMIN_PERMISSIONS.BULK_ASSIGN_TICKETS),
  asyncRoute(async (req, res) => {
    const { ticketIds, assigneeAdminId } = safeObject(req.body);
    const ids = safeArray(ticketIds).map(asString).filter(Boolean);

    if (ids.length === 0) {
      return res.status(400).json({ error: "Missing ticketIds" });
    }

    const result = await pool.query(
      `UPDATE support_tickets
       SET assignee_admin_id = $1,
           updated_at = now()
       WHERE id = ANY($2::uuid[])
       RETURNING *`,
      [asString(assigneeAdminId) || null, ids],
    );

    res.json({
      ok: true,
      tickets: result.rows.map((row) => serializeSupportTicketRow(row)),
    });
  }),
);

// --- End Support Tickets ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "..", "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/webhooks") || req.path.startsWith("/metrics") || req.path.startsWith("/health")) {
      return next();
    }
    res.sendFile(resolve(distDir, "index.html"));
  });
  console.log(`[vulu-api] Serving static files from ${distDir}`);
}

app.use((error, _req, res, _next) => {
  console.error("[vulu-api] request failed", error);
  res.status(500).json({
    error: error instanceof Error ? error.message : "Unexpected server error",
  });
});

const start = async () => {
  await initializeDatabase();
  const server = app.listen(port, () => {
    console.log(`vulu-api listening on port ${port}`);
  });
  const realtimeServer = attachRealtimeServer(server);
  activeRealtimeServer = realtimeServer;
  const metricsLogTimer = setInterval(() => {
    logRealtimeMetrics("interval");
  }, effectiveRealtimeMetricsLogIntervalMs);
  metricsLogTimer.unref?.();

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(metricsLogTimer);
    logRealtimeMetrics("shutdown");
    activeRealtimeServer = null;
    await new Promise((resolve) => {
      realtimeServer.close(() => resolve());
    });
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

start().catch((error) => {
  console.error("Failed to start vulu-api", error);
  process.exit(1);
});
