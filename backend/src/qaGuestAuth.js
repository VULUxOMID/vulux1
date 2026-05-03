import { SignJWT, jwtVerify } from "jose";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeBoolean(value) {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isLoopbackAddress(value) {
  const normalized = normalizeString(value);
  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "localhost"
  );
}

function sanitizeIdentifier(value, fallback = "guest") {
  const normalized = normalizeString(value).toLowerCase();
  const collapsed = normalized.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (collapsed || fallback).slice(0, 64);
}

function readPositiveInteger(value, fallback) {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : Number.parseInt(normalizeString(value), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function createSecretKey(secret) {
  return new TextEncoder().encode(secret);
}

function readGuestPayload(body) {
  const rawIdentifier =
    normalizeString(body?.identifier) ||
    normalizeString(body?.username) ||
    normalizeString(body?.displayName) ||
    "guest";
  const username = sanitizeIdentifier(body?.username || rawIdentifier);
  const displayName = normalizeString(body?.displayName) || rawIdentifier;
  const subject = `qa_guest:${username}`;
  const emailAddress = `${username}@qa.example.com`;

  return {
    subject,
    username,
    displayName: displayName.slice(0, 80),
    emailAddress,
  };
}

export function createQaGuestAuthHelper(env) {
  const enabled = normalizeBoolean(env.QA_GUEST_AUTH_ENABLE);
  const secret = normalizeString(env.QA_GUEST_AUTH_SECRET);
  const issuer = normalizeString(env.QA_GUEST_AUTH_ISSUER) || "https://qa-guest.vulu.local";
  const audience =
    normalizeString(env.QA_GUEST_AUTH_AUDIENCE) ||
    normalizeString(env.CLERK_JWT_AUDIENCE?.split?.(",")?.[0]) ||
    normalizeString(env.AUTH_JWT_AUDIENCE?.split?.(",")?.[0]) ||
    "vulu-backend";
  const ttlSeconds = readPositiveInteger(env.QA_GUEST_AUTH_TTL_SECONDS, 7 * 24 * 60 * 60);

  if (enabled && !secret) {
    throw new Error("QA_GUEST_AUTH_SECRET is required when QA_GUEST_AUTH_ENABLE=true.");
  }

  async function createSession(body, remoteAddress) {
    if (!enabled) {
      throw Object.assign(new Error("QA guest auth helper is disabled."), { statusCode: 404 });
    }

    if (!isLoopbackAddress(remoteAddress)) {
      throw Object.assign(new Error("QA guest auth helper only accepts loopback requests."), {
        statusCode: 403,
      });
    }

    const payload = readGuestPayload(body);
    const token = await new SignJWT({
      provider: "qa_guest",
      email: payload.emailAddress,
      email_verified: true,
      preferred_username: payload.username,
      name: payload.displayName,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(payload.subject)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(createSecretKey(secret));

    return {
      token,
      provider: "qa_guest",
      issuer,
      subject: payload.subject,
      username: payload.username,
      displayName: payload.displayName,
      emailAddress: payload.emailAddress,
      expiresInSeconds: ttlSeconds,
    };
  }

  async function verifyToken(token) {
    if (!enabled || !secret) {
      throw new Error("QA guest auth helper is disabled.");
    }

    const verification = await jwtVerify(token, createSecretKey(secret), {
      issuer,
      audience,
    });
    const subject = normalizeString(verification.payload.sub);
    if (!subject) {
      throw new Error("QA guest JWT subject is missing.");
    }
    return {
      subject,
      payload: verification.payload,
    };
  }

  return {
    enabled,
    issuer,
    audience,
    createSession,
    verifyToken,
  };
}
