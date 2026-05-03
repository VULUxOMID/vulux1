import http from "node:http";
import { randomUUID } from "node:crypto";

import { createRemoteJWKSet } from "jose";

import {
  DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  generatePresignedUrl,
  getPublicUrlForObjectKey,
  isR2Configured,
} from "./r2.js";
import { createJwtVerifyOptions, verifyViewerUserId } from "./auth.js";
import { createDemoLiveStore } from "./demoLiveState.js";
import { createQaGuestAuthHelper } from "./qaGuestAuth.js";
import {
  createCashTransfer,
  createWithdrawal,
  handleLiveMutation,
  handleMutation,
  handleWalletMutation,
  isRailwayDataConfigured,
  listCashTransfers,
  listWithdrawals,
  loadSnapshot,
  readAccountState,
  writeAccountState,
} from "./railwayData.js";
import { createRtcServer } from "./rtc.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;
const authJwksUrl = (process.env.CLERK_JWKS_URL ?? process.env.AUTH_JWKS_URL ?? "").trim();
const authJwtIssuer = (process.env.CLERK_JWT_ISSUER ?? process.env.AUTH_JWT_ISSUER ?? "").trim();
const authJwtAudienceList = (process.env.CLERK_JWT_AUDIENCE ?? process.env.AUTH_JWT_AUDIENCE ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const jwks = authJwksUrl ? createRemoteJWKSet(new URL(authJwksUrl)) : null;
const jwtVerifyOptions =
  authJwtAudienceList.length > 0
    ? createJwtVerifyOptions({
        issuer: authJwtIssuer,
        audienceList: authJwtAudienceList,
      })
    : null;
const issuerOnlyJwtVerifyOptions = createJwtVerifyOptions({
  issuer: authJwtIssuer,
  audienceList: [],
  audienceRequired: false,
});
const qaGuestAuthHelper = createQaGuestAuthHelper(process.env);
const demoLiveStore = createDemoLiveStore();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const MAX_BYTES_BY_MEDIA_TYPE = {
  profile: 20 * 1024 * 1024,
  verification: 20 * 1024 * 1024,
  chat: 20 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  music: 50 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  file: 100 * 1024 * 1024,
  media: 100 * 1024 * 1024,
};
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
]);
const rateLimitBuckets = new Map();

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, error, fallbackMessage) {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? Number(error.statusCode) || 500
      : 500;
  const message =
    error instanceof Error && error.message
      ? error.message
      : fallbackMessage;
  const payload =
    error && typeof error === "object" && "details" in error
      ? { error: message, details: error.details }
      : { error: message };
  sendJson(res, statusCode, payload);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const normalizedToken = token?.trim();
  return normalizedToken ? normalizedToken : null;
}

async function verifyAnyViewerUserId(token) {
  if (qaGuestAuthHelper.enabled) {
    try {
      const qaGuest = await qaGuestAuthHelper.verifyToken(token);
      if (qaGuest?.subject) {
        return qaGuest.subject;
      }
    } catch {
      // Fall through to the primary JWT verifier.
    }
  }

  if (!jwks) {
    throw Object.assign(new Error("Auth JWT verification is not configured."), { statusCode: 503 });
  }
  if (!jwtVerifyOptions) {
    throw Object.assign(new Error("Auth JWT audience is not configured."), { statusCode: 503 });
  }

  try {
    return await verifyViewerUserId({ token, jwks, jwtVerifyOptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/missing required \"aud\" claim/i.test(message)) {
      throw error;
    }
    return await verifyViewerUserId({
      token,
      jwks,
      jwtVerifyOptions: issuerOnlyJwtVerifyOptions,
    });
  }
}

async function requireViewerUserId(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  }

  try {
    return await verifyAnyViewerUserId(token);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Token verification failed.";
    throw Object.assign(new Error(message), { statusCode: 401 });
  }
}

function resolveMediaPrefix(userId, mediaType) {
  const normalizedType = typeof mediaType === "string" ? mediaType.trim().toLowerCase() : "";
  return Object.hasOwn(MAX_BYTES_BY_MEDIA_TYPE, normalizedType) ? normalizedType : "media";
}

function extensionForContentType(contentType) {
  const normalized = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/heic") return "heic";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/quicktime") return "mov";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/mp4") return "m4a";
  if (normalized.startsWith("image/")) return normalized.slice("image/".length);
  if (normalized.startsWith("video/")) return normalized.slice("video/".length);
  if (normalized.startsWith("audio/")) return normalized.slice("audio/".length);
  return "bin";
}

function sanitizeUserId(userId) {
  const normalized = String(userId ?? "").trim();
  const sanitized = normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "anonymous";
}

function buildObjectKey(userId, mediaType, contentType) {
  const normalizedUserId = sanitizeUserId(userId);
  const normalizedMediaType = resolveMediaPrefix(normalizedUserId, mediaType);
  const extension = extensionForContentType(contentType);
  return `uploads/${normalizedUserId}/${normalizedMediaType}-${randomUUID()}.${extension}`;
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function assertWithinRateLimit(userId, ipAddress) {
  const key = `${sanitizeUserId(userId)}:${ipAddress}`;
  const now = Date.now();
  const recentRequests = (rateLimitBuckets.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    throw Object.assign(new Error("Rate limit exceeded. Please retry shortly."), {
      statusCode: 429,
    });
  }

  recentRequests.push(now);
  rateLimitBuckets.set(key, recentRequests);
}

function parseUploadSize(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
}

function validateMimeForMediaType(mediaType, contentType) {
  const normalizedType = resolveMediaPrefix("ignored", mediaType);
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw Object.assign(new Error(`Unsupported content type: ${contentType}`), {
      statusCode: 415,
    });
  }

  if (["profile", "verification", "chat", "image"].includes(normalizedType) && !contentType.startsWith("image/")) {
    throw Object.assign(new Error(`"${normalizedType}" uploads must use an image content type.`), {
      statusCode: 415,
    });
  }

  if (["audio", "music"].includes(normalizedType) && !contentType.startsWith("audio/")) {
    throw Object.assign(new Error(`"${normalizedType}" uploads must use an audio content type.`), {
      statusCode: 415,
    });
  }

  if (normalizedType === "video" && !contentType.startsWith("video/")) {
    throw Object.assign(new Error(`"${normalizedType}" uploads must use a video content type.`), {
      statusCode: 415,
    });
  }
}

function validateUploadRequest(body) {
  const contentType =
    typeof body.contentType === "string" && body.contentType.trim().length > 0
      ? body.contentType.trim().toLowerCase()
      : "";
  if (!contentType) {
    throw Object.assign(new Error("contentType is required."), { statusCode: 400 });
  }

  const mediaType = resolveMediaPrefix("ignored", body.mediaType);
  const size = parseUploadSize(body.size);
  if (size === null || size <= 0) {
    throw Object.assign(new Error("size must be a positive integer."), { statusCode: 400 });
  }

  validateMimeForMediaType(mediaType, contentType);

  const maxBytes = MAX_BYTES_BY_MEDIA_TYPE[mediaType] ?? MAX_BYTES_BY_MEDIA_TYPE.media;
  if (size > maxBytes) {
    throw Object.assign(
      new Error(`Upload exceeds max size for "${mediaType}" (${maxBytes} bytes).`),
      { statusCode: 413 },
    );
  }

  return {
    contentType,
    mediaType,
    size,
    maxBytes,
  };
}

async function handleRailwayApiRequest(req, res, url) {
  const pathname = url.pathname;

  if (req.method === "GET" && (pathname === "/snapshot" || pathname === "/snapshot/patch")) {
    const viewerUserId = await requireViewerUserId(req);
    const data = await loadSnapshot(viewerUserId);
    sendJson(res, 200, {
      data,
      source: "railway",
      durable: isRailwayDataConfigured(),
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/account/state") {
    const viewerUserId = await requireViewerUserId(req);
    const state = await readAccountState(viewerUserId);
    sendJson(res, 200, {
      state,
      source: "railway",
      durable: isRailwayDataConfigured(),
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/account/state") {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await writeAccountState(viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  if (
    req.method === "GET" &&
    (pathname === "/api/social/snapshot" ||
      pathname === "/api/media/snapshot" ||
      pathname === "/api/messages/snapshot")
  ) {
    const viewerUserId = await requireViewerUserId(req);
    const data = await loadSnapshot(viewerUserId);
    sendJson(res, 200, {
      data,
      source: "railway",
      durable: isRailwayDataConfigured(),
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/wallet/withdrawals") {
    const viewerUserId = await requireViewerUserId(req);
    const requests = await listWithdrawals(viewerUserId);
    sendJson(res, 200, {
      requests,
      data: requests,
      source: "railway",
      durable: isRailwayDataConfigured(),
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/wallet/withdrawals") {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await createWithdrawal(viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/wallet/transfers") {
    const viewerUserId = await requireViewerUserId(req);
    const transfers = await listCashTransfers(viewerUserId, url.searchParams.get("limit") ?? 20);
    sendJson(res, 200, {
      transfers,
      data: transfers,
      source: "railway",
      durable: isRailwayDataConfigured(),
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/wallet/transfers") {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await createCashTransfer(viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  if (
    (req.method === "POST" || req.method === "DELETE") &&
    (pathname.startsWith("/api/social/") ||
      pathname.startsWith("/api/messages/") ||
      pathname.startsWith("/api/media/"))
  ) {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await handleMutation(pathname, req.method, viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/wallet/mutate") {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await handleWalletMutation(viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  if (req.method === "POST" && pathname.startsWith("/api/live/")) {
    const viewerUserId = await requireViewerUserId(req);
    const body = await readJsonBody(req);
    const result = await handleLiveMutation(pathname, viewerUserId, body);
    sendJson(res, 200, {
      source: "railway",
      viewerUserId,
      ...result,
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Malformed request." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "vulu-railway-backend",
      storageReady: isR2Configured,
      databaseReady: isRailwayDataConfigured(),
      rtcReady: rtcServer.health.enabled,
      rtcAuthReady: rtcServer.health.authReady,
      qaAuthReady: false,
      qaGuestAuthReady: qaGuestAuthHelper.enabled,
    });
    return;
  }

  try {
    if (await handleRailwayApiRequest(req, res, url)) {
      return;
    }
  } catch (error) {
    sendError(res, error, "Railway API request failed.");
    return;
  }

  if (req.method === "POST" && url.pathname === "/qa/guest-session") {
    try {
      const body = await readJsonBody(req);
      const payload = await qaGuestAuthHelper.createSession(body, getClientIp(req));
      sendJson(res, 200, payload);
      return;
    } catch (error) {
      sendError(res, error, "Failed to create QA guest session.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/demo/login") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, demoLiveStore.login(body));
      return;
    } catch (error) {
      sendError(res, error, "Failed to start demo session.");
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/demo/state") {
    try {
      sendJson(
        res,
        200,
        demoLiveStore.getState({
          username: url.searchParams.get("username"),
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to load demo state.");
      return;
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/demo/rooms/")) {
    try {
      const roomId = decodeURIComponent(url.pathname.slice("/demo/rooms/".length));
      sendJson(
        res,
        200,
        demoLiveStore.getRoom({
          roomId,
          username: url.searchParams.get("username"),
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to load demo room.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/demo/rooms") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, demoLiveStore.createRoom(body));
      return;
    } catch (error) {
      sendError(res, error, "Failed to create demo room.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname.endsWith("/start") && url.pathname.startsWith("/demo/rooms/")) {
    try {
      const roomId = decodeURIComponent(
        url.pathname.slice("/demo/rooms/".length, -"/start".length),
      );
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        demoLiveStore.startRoom({
          roomId,
          username: body.username,
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to start demo room.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname.endsWith("/join") && url.pathname.startsWith("/demo/rooms/")) {
    try {
      const roomId = decodeURIComponent(
        url.pathname.slice("/demo/rooms/".length, -"/join".length),
      );
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        demoLiveStore.joinRoom({
          roomId,
          username: body.username,
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to join demo room.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname.endsWith("/leave") && url.pathname.startsWith("/demo/rooms/")) {
    try {
      const roomId = decodeURIComponent(
        url.pathname.slice("/demo/rooms/".length, -"/leave".length),
      );
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        demoLiveStore.leaveRoom({
          roomId,
          username: body.username,
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to leave demo room.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname.endsWith("/invite") && url.pathname.startsWith("/demo/rooms/")) {
    try {
      const roomId = decodeURIComponent(
        url.pathname.slice("/demo/rooms/".length, -"/invite".length),
      );
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        demoLiveStore.inviteUser({
          roomId,
          username: body.username,
          targetUsername: body.targetUsername,
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to invite demo user.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname.endsWith("/respond") && url.pathname.startsWith("/demo/invites/")) {
    try {
      const inviteId = decodeURIComponent(
        url.pathname.slice("/demo/invites/".length, -"/respond".length),
      );
      const body = await readJsonBody(req);
      sendJson(
        res,
        200,
        demoLiveStore.respondToInvite({
          inviteId,
          username: body.username,
          accept: body.accept === true,
        }),
      );
      return;
    } catch (error) {
      sendError(res, error, "Failed to respond to demo invite.");
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/presign") {
    try {
      if (!isR2Configured) {
        sendJson(res, 503, { error: "Storage is not fully configured." });
        return;
      }

      const viewerUserId = await requireViewerUserId(req);
      const body = await readJsonBody(req);
      const { contentType, mediaType, size, maxBytes } = validateUploadRequest(body);
      assertWithinRateLimit(viewerUserId, getClientIp(req));

      const objectKey = buildObjectKey(viewerUserId, mediaType, contentType);
      const presignedUrl = await generatePresignedUrl({
        objectKey,
        contentType,
        expiresInSeconds: DEFAULT_PRESIGNED_URL_TTL_SECONDS,
      });

      console.log(
        `[railway-backend] presign user=${viewerUserId} size=${size} type=${contentType} key=${objectKey}`,
      );

      const publicUrl = getPublicUrlForObjectKey(objectKey);
      await handleMutation("/api/media/uploads", "POST", viewerUserId, {
        objectKey,
        publicUrl,
        contentType,
        mediaType,
        size,
        uploadStatus: "presigned",
      });

      sendJson(res, 200, {
        url: presignedUrl,
        objectKey,
        publicUrl,
        requiredHeaders: {
          "Content-Type": contentType,
        },
        maxBytes,
        expiresInSeconds: DEFAULT_PRESIGNED_URL_TTL_SECONDS,
      });
      return;
    } catch (error) {
      sendError(res, error, "Failed to create upload URL.");
      return;
    }
  }

  sendJson(res, 404, { error: "Not found." });
});

const rtcServer = createRtcServer(server, {
  enabled: process.env.RTC_ENABLE ?? "1",
  topology: process.env.RTC_TOPOLOGY ?? "mesh",
  maxActivePublishers: process.env.RTC_MAX_ACTIVE_PUBLISHERS,
  inviteTtlMs: process.env.RTC_INVITE_TTL_MS,
  stunUrls: process.env.RTC_STUN_URLS,
  turnUrls: process.env.RTC_TURN_URLS,
  turnSecret: process.env.RTC_TURN_SECRET,
  turnTtlSeconds: process.env.RTC_TURN_TTL_SECONDS,
  enableWebScreenshare: process.env.RTC_ENABLE_WEB_SCREENSHARE,
  enableNativeScreenshare: process.env.RTC_ENABLE_NATIVE_SCREENSHARE,
  debugOverlay: process.env.RTC_DEBUG_OVERLAY,
  verifyAuthToken: async (token) => verifyAnyViewerUserId(token),
});

server.listen(port, () => {
  console.log(
    `[railway-backend] Listening on port ${port}. Clerk JWT auth ${jwks ? "enabled" : "disabled"}; R2 ${isR2Configured ? "ready" : "not configured"}; RTC ${rtcServer.enabled ? "enabled" : "disabled"}; QA guest auth ${qaGuestAuthHelper.enabled ? "enabled" : "disabled"}.`,
  );
});
