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

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    fail('Missing CLERK_SECRET_KEY. Run with `node --env-file=.env.local ...`.');
  }

  const stamp = Math.floor(Date.now() / 1000);
  const username = process.env.QA_CLERK_USERNAME?.trim() || `authqa_clerktest_${stamp}`;
  const email = process.env.QA_CLERK_EMAIL?.trim() || `authqa+${stamp}+clerk_test@example.com`;
  const password = process.env.QA_CLERK_PASSWORD?.trim() || 'AuthQa123!';
  const phone =
    process.env.QA_CLERK_PHONE?.trim() ||
    `+1415555${Math.floor(1000 + Math.random() * 9000).toString()}`;

  const created = await clerkRequest(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email_address: [email],
        username,
        phone_number: [phone],
        password,
        skip_password_checks: true,
      }),
    },
    secretKey,
  );

  console.log('Created Clerk QA user');
  console.log(`user_id=${created.id}`);
  console.log(`username=${created.username}`);
  console.log(`email=${created.email_addresses?.[0]?.email_address ?? email}`);
  console.log(`phone=${created.phone_numbers?.[0]?.phone_number ?? phone}`);
  console.log(`password=${password}`);
  console.log('otp_test_code=424242');
  console.log('note=Use this account for deterministic web smoke login.');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
