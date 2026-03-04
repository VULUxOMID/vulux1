#!/usr/bin/env node

const API_BASE = 'https://api.clerk.com/v1';

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function clerkRequest(path, init, secretKey) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Clerk API ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

async function resolveUserId(secretKey) {
  const explicitUserId = process.env.QA_CLERK_USER_ID?.trim();
  if (explicitUserId) {
    return explicitUserId;
  }

  const username = process.env.QA_CLERK_USERNAME?.trim();
  if (!username) {
    fail('Set QA_CLERK_USER_ID or QA_CLERK_USERNAME before generating a ticket.');
  }

  const users = await clerkRequest(
    `/users?limit=100&query=${encodeURIComponent(username)}`,
    { method: 'GET' },
    secretKey,
  );

  if (!Array.isArray(users) || users.length === 0) {
    fail(`No Clerk users matched query="${username}".`);
  }

  const exact = users.find((user) => user?.username === username);
  const chosen = exact ?? users[0];
  if (!chosen?.id) {
    fail('Matched user payload is missing an id.');
  }

  return chosen.id;
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    fail('Missing CLERK_SECRET_KEY. Run with `node --env-file=.env.local ...`.');
  }

  const ttlRaw = process.env.QA_CLERK_TICKET_TTL_SECONDS?.trim() || '300';
  const ttlSeconds = Number.parseInt(ttlRaw, 10);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    fail('QA_CLERK_TICKET_TTL_SECONDS must be a positive integer.');
  }

  const userId = await resolveUserId(secretKey);
  const token = await clerkRequest(
    '/sign_in_tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        expires_in_seconds: ttlSeconds,
      }),
    },
    secretKey,
  );

  const value = typeof token?.token === 'string' ? token.token : null;
  if (!value) {
    fail('Clerk did not return a sign-in token string.');
  }

  console.log(`user_id=${userId}`);
  console.log(`ticket_expires_in_seconds=${ttlSeconds}`);
  console.log(`EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET=${value}`);
  console.log('note=Export this value before starting Expo web for pending-step fallback.');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
