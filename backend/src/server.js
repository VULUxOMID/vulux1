import http from "node:http";
import { randomUUID } from "node:crypto";

import { createRemoteJWKSet } from "jose";

import {
  DEFAULT_PRESIGNED_URL_TTL_SECONDS,
  generatePresignedUrl,
  getPublicUrlForObjectKey,
  isR2Configured,
  uploadObject,
} from "./r2.js";
import { createJwtVerifyOptions, verifyViewerUserId } from "./auth.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;
const authJwksUrl = (process.env.AUTH_JWKS_URL ?? "").trim();
const authJwtIssuer = (process.env.AUTH_JWT_ISSUER ?? "").trim();
const authJwtAudienceList = (process.env.AUTH_JWT_AUDIENCE ?? "")
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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const MAX_BYTES_BY_MEDIA_TYPE = {
  profile: 20 * 1024 * 1024,
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
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

async function readRawBody(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (Number.isFinite(maxBytes) && maxBytes > 0 && totalBytes > maxBytes) {
      throw Object.assign(new Error(`Upload exceeds allowed size (${maxBytes} bytes).`), {
        statusCode: 413,
      });
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
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

async function requireViewerUserId(req) {
  if (!jwks) {
    throw Object.assign(new Error("Auth JWT verification is not configured."), { statusCode: 503 });
  }
  if (!jwtVerifyOptions) {
    throw Object.assign(new Error("Auth JWT audience is not configured."), { statusCode: 503 });
  }

  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Missing bearer token."), { statusCode: 401 });
  }

  try {
    return await verifyViewerUserId({ token, jwks, jwtVerifyOptions });
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

function buildProxyUploadUrl(req, objectKey) {
  const origin = `http://${req.headers.host ?? "localhost"}`;
  return `${origin}/upload?objectKey=${encodeURIComponent(objectKey)}`;
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

  if (["profile", "chat", "image"].includes(normalizedType) && !contentType.startsWith("image/")) {
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

function resolveMaxBytesForContentType(contentType) {
  if (typeof contentType !== "string" || !contentType.trim()) {
    return MAX_BYTES_BY_MEDIA_TYPE.media;
  }

  if (contentType.startsWith("image/")) {
    return MAX_BYTES_BY_MEDIA_TYPE.image;
  }
  if (contentType.startsWith("audio/")) {
    return MAX_BYTES_BY_MEDIA_TYPE.audio;
  }
  if (contentType.startsWith("video/")) {
    return MAX_BYTES_BY_MEDIA_TYPE.video;
  }
  return MAX_BYTES_BY_MEDIA_TYPE.media;
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
      service: "upload-signer",
      storageReady: isR2Configured,
    });
    return;
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
        `[upload-signer] presign user=${viewerUserId} size=${size} type=${contentType} key=${objectKey}`,
      );

      sendJson(res, 200, {
        url: presignedUrl,
        webUploadUrl: buildProxyUploadUrl(req, objectKey),
        objectKey,
        publicUrl: getPublicUrlForObjectKey(objectKey),
        requiredHeaders: {
          "Content-Type": contentType,
        },
        maxBytes,
        expiresInSeconds: DEFAULT_PRESIGNED_URL_TTL_SECONDS,
      });
      return;
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode) || 500
          : 500;
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to create upload URL.";
      sendJson(res, statusCode, { error: message });
      return;
    }
  }

  if (req.method === "PUT" && url.pathname === "/upload") {
    try {
      if (!isR2Configured) {
        sendJson(res, 503, { error: "Storage is not fully configured." });
        return;
      }

      const viewerUserId = await requireViewerUserId(req);
      const objectKey = url.searchParams.get("objectKey")?.trim() ?? "";
      if (!objectKey) {
        sendJson(res, 400, { error: "objectKey is required." });
        return;
      }

      const expectedPrefix = `uploads/${sanitizeUserId(viewerUserId)}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        sendJson(res, 403, { error: "Upload target does not belong to this user." });
        return;
      }

      const contentType =
        typeof req.headers["content-type"] === "string"
          ? req.headers["content-type"].trim().toLowerCase()
          : "";
      if (!contentType) {
        sendJson(res, 400, { error: "Content-Type header is required." });
        return;
      }

      validateMimeForMediaType("media", contentType);
      const maxBytes = resolveMaxBytesForContentType(contentType);
      const body = await readRawBody(req, maxBytes);
      if (!body.length) {
        sendJson(res, 400, { error: "Upload body is empty." });
        return;
      }

      assertWithinRateLimit(viewerUserId, getClientIp(req));
      await uploadObject({
        objectKey,
        contentType,
        body,
      });

      console.log(
        `[upload-signer] proxy-upload user=${viewerUserId} bytes=${body.length} type=${contentType} key=${objectKey}`,
      );

      sendJson(res, 200, {
        ok: true,
        objectKey,
        publicUrl: getPublicUrlForObjectKey(objectKey),
      });
      return;
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode) || 500
          : 500;
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to upload file.";
      sendJson(res, statusCode, { error: message });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(port, () => {
  console.log(
    `[upload-signer] Listening on port ${port}. JWT auth ${jwks ? "enabled" : "disabled"}; R2 ${isR2Configured ? "ready" : "not configured"}.`,
  );
});
