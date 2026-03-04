#!/usr/bin/env node

function fail(message) {
  console.error(message);
  process.exit(1);
}

function decodeFrontendHostFromPublishableKey(key) {
  const trimmed = key.trim();
  const marker = trimmed.startsWith('pk_test_') ? 'pk_test_' : trimmed.startsWith('pk_live_') ? 'pk_live_' : null;
  if (!marker) {
    return null;
  }

  const encoded = trimmed.slice(marker.length).replace(/\$/g, '');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8').trim();
    return decoded.replace(/\$/g, '') || null;
  } catch {
    return null;
  }
}

async function main() {
  const username = process.env.QA_USERNAME?.trim();
  const password = process.env.QA_PASSWORD?.trim();
  if (!username || !password) {
    fail('Missing QA_USERNAME or QA_PASSWORD.');
  }

  const explicitHost = process.env.QA_CLERK_FRONTEND_API?.trim();
  const publishable = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const decodedHost = publishable ? decodeFrontendHostFromPublishableKey(publishable) : null;
  const host = explicitHost || decodedHost;
  if (!host) {
    fail('Unable to resolve Clerk Frontend API host. Set QA_CLERK_FRONTEND_API.');
  }

  const base = `https://${host}`;
  console.log(`frontend_api=${host}`);

  const clientResponse = await fetch(`${base}/v1/client`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const authHeader = clientResponse.headers.get('authorization')?.trim();
  if (!authHeader) {
    fail('Clerk Frontend API did not return rotating Authorization header.');
  }

  const signInResponse = await fetch(`${base}/v1/client/sign_ins`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      strategy: 'password',
      identifier: username,
      password,
    }),
  });

  const payload = await signInResponse.json();
  const signIn = payload?.response ?? {};

  console.log(
    JSON.stringify(
      {
        status: signIn.status ?? null,
        client_trust_state: signIn.client_trust_state ?? null,
        supported_first_factors: signIn.supported_first_factors ?? null,
        supported_second_factors: signIn.supported_second_factors ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
