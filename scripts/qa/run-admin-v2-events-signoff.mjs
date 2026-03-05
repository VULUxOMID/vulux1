#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_BASE = 'https://api.clerk.com/v1';
const LOG_PREFIX = '[AUTH-QA VUL-58/63/64]';
const ADMIN_CLERK_USER_ID =
  process.env.QA_ADMIN_CLERK_USER_ID?.trim() || 'user_39rwIuDDExMrSqEPrw602uloYig';
const QA_SIGNIN_CODE = (process.env.QA_SIGNIN_CODE ?? '424242').trim();
const QA_TOTP_SECRET = (process.env.QA_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXP').trim();
const QA_BASE_URL = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:19083').trim().replace(/\/$/, '');
const QA_EVIDENCE_DIR = (process.env.QA_EVIDENCE_DIR ?? '/Users/omid/vulux1/docs/qa').trim();
const SPACETIME_BIN = (process.env.SPACETIME_BIN ?? '/Users/omid/.local/bin/spacetime').trim();
const DB_NAME = (process.env.EXPO_PUBLIC_SPACETIMEDB_NAME ?? 'vulu').trim();
const DB_SERVER = (process.env.QA_SPACETIME_SERVER ?? 'maincloud').trim();
const LOG_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-admin-signoff.log');

const ROLE_BEFORE_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-role-before.txt');
const ROLE_AFTER_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-role-after.txt');
const CONFIG_BEFORE_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-config-before.txt');
const CONFIG_AFTER_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-config-after.txt');
const AUDIT_AFTER_FILE = path.join(QA_EVIDENCE_DIR, 'vul-58-63-64-audit-after.txt');
const BEFORE_DENIED_SCREENSHOT = path.join(
  QA_EVIDENCE_DIR,
  'vul-58-63-64-before-access-denied.png',
);
const AFTER_ACCESS_SCREENSHOT = path.join(
  QA_EVIDENCE_DIR,
  'vul-58-63-64-after-admin-access.png',
);
const AFTER_WRITE_SCREENSHOT = path.join(
  QA_EVIDENCE_DIR,
  'vul-58-63-64-events-after-writes.png',
);

function fail(message) {
  throw new Error(message);
}

async function fileExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

const logLines = [];
async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logLines.push(line);
  console.log(line);
  await writeFile(LOG_FILE, `${logLines.join('\n')}\n`);
}

function normalizeOutput(text) {
  return text.replace(/\u001B\[[0-9;]*m/g, '').trim();
}

async function runCommand(command, args, { allowFailure = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: '/Users/omid/vulux1',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const output = {
        code: code ?? 1,
        stdout: normalizeOutput(stdout),
        stderr: normalizeOutput(stderr),
      };
      if (!allowFailure && output.code !== 0) {
        reject(
          new Error(
            `Command failed (${output.code}): ${command} ${args.join(' ')}\n${output.stdout}\n${output.stderr}`,
          ),
        );
        return;
      }
      resolve(output);
    });
  });
}

async function runSql(query, outputPath) {
  await log(`$ ${SPACETIME_BIN} sql ${DB_NAME} "${query}" --server ${DB_SERVER}`);
  const result = await runCommand(SPACETIME_BIN, [
    'sql',
    DB_NAME,
    query,
    '--server',
    DB_SERVER,
  ]);
  const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
  await writeFile(outputPath, `${combinedOutput}\n`);
  await log(combinedOutput || '(no output)');
  return combinedOutput;
}

async function waitForSqlContains(query, outputPath, fragment, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const output = await runSql(query, outputPath);
    if (output.includes(fragment)) {
      return output;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`Timed out waiting for SQL output fragment: ${fragment}`);
}

async function clerkRequest(pathname, init, secretKey) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(`Clerk API ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function createQaProfile() {
  const stamp = Date.now();
  const suffix = randomUUID().slice(0, 8);
  const localPrefix = String((stamp % 8) + 2);
  const localTail = String(stamp).slice(-6).padStart(6, '0');
  return {
    username: `authqa_admin_${stamp}_${suffix}`,
    email: `authqa+admin.${stamp}.${suffix}@example.com`,
    password: `AuthQa!${stamp}${suffix}`,
    // Clerk requires phone_number on this instance; derive a deterministic unique NANP-safe number.
    phone: `+1415${localPrefix}${localTail}`,
  };
}

async function provisionQaUser(secretKey) {
  const profile = createQaProfile();
  const created = await clerkRequest(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email_address: [profile.email],
        username: profile.username,
        phone_number: [profile.phone],
        password: profile.password,
        skip_password_checks: true,
      }),
    },
    secretKey,
  );
  return {
    clerkUserId: String(created.id),
    username: profile.username,
    email: profile.email,
    password: profile.password,
  };
}

async function createSignInTicket(secretKey, clerkUserId) {
  const response = await clerkRequest(
    '/sign_in_tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: clerkUserId,
        expires_in_seconds: 600,
      }),
    },
    secretKey,
  );

  const token = typeof response?.token === 'string' ? response.token : null;
  if (!token) {
    fail(`Missing sign-in token for Clerk user ${clerkUserId}`);
  }
  return token;
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Timed out waiting for ${url}`);
}

function startExpoWithTicket(signInTicket) {
  const baseUrlObject = new URL(QA_BASE_URL);
  const expoPort = baseUrlObject.port || '19083';
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const expoArgs = ['expo', 'start', '--web', '--port', expoPort];
  const expo = spawn(npxCmd, expoArgs, {
    cwd: '/Users/omid/vulux1',
    env: {
      ...process.env,
      CI: '1',
      EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: signInTicket,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  expo.stdout.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`${LOG_PREFIX} [expo] ${text}`);
    }
  });
  expo.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`${LOG_PREFIX} [expo:stderr] ${text}`);
    }
  });

  return expo;
}

async function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function readCachedSession(page) {
  return await page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('vulu.auth.session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const vuluUserId =
        typeof parsed.vuluUserId === 'string'
          ? parsed.vuluUserId.trim()
          : typeof parsed.userId === 'string'
            ? parsed.userId.trim()
            : '';
      const roles = Array.isArray(parsed.roles)
        ? parsed.roles
            .map((role) => (typeof role === 'string' ? role.trim().toLowerCase() : ''))
            .filter((role) => role.length > 0)
        : [];
      return {
        vuluUserId: vuluUserId || null,
        roles,
      };
    } catch {
      return null;
    }
  });
}

async function isLoginUiVisible(page) {
  const signInButtonVisible = await page
    .getByRole('button', { name: 'Sign in' })
    .isVisible({ timeout: 600 })
    .catch(() => false);
  const identifierVisible = await page
    .getByPlaceholder('Email or username')
    .isVisible({ timeout: 600 })
    .catch(() => false);
  return signInButtonVisible || identifierVisible;
}

async function maybeCompleteClerkSecondFactor(page) {
  const signInCodeInput = page.getByPlaceholder('Sign-in verification code');
  const codePromptVisible = await signInCodeInput.isVisible({ timeout: 500 }).catch(() => false);
  if (!codePromptVisible) {
    return false;
  }

  await signInCodeInput.fill(QA_SIGNIN_CODE);
  await page.getByRole('button', { name: 'Verify sign-in code' }).click();
  return true;
}

async function waitForAuthenticatedSession(page, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const session = await readCachedSession(page);
    if (session?.vuluUserId) {
      return session;
    }

    await maybeCompleteClerkSecondFactor(page);
    const loginVisible = await isLoginUiVisible(page);
    if (!loginVisible && !page.url().includes('/login')) {
      const fallbackSession = await readCachedSession(page);
      if (fallbackSession?.vuluUserId) {
        return fallbackSession;
      }
    }
    await page.waitForTimeout(1000);
  }

  fail(`Timed out waiting for authenticated session. currentUrl=${page.url()}`);
}

async function loginWithCredentials(page, identifiers, password) {
  const attempts = Array.from(
    new Set(identifiers.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
  if (attempts.length === 0) {
    fail('No identifiers supplied for credential login.');
  }

  let lastError = null;
  for (const identifier of attempts) {
    await page.goto(`${QA_BASE_URL}/login`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await page.getByPlaceholder('Email or username').fill(identifier);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    try {
      return await waitForAuthenticatedSession(page);
    } catch (error) {
      lastError = error;
      const bodyText = await page.locator('body').innerText().catch(() => '');
      await log(
        `${LOG_PREFIX} credential login attempt failed for "${identifier}"; body=${bodyText
          .slice(0, 280)
          .replaceAll('\n', ' ')}`,
      );
    }
  }

  throw lastError ?? new Error('Credential login failed for all identifiers.');
}

async function loginWithTicket(page) {
  await page.goto(`${QA_BASE_URL}/login`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.getByRole('button', { name: 'Sign in' }).click();
  return await waitForAuthenticatedSession(page);
}

async function waitForDebugHandle(page, timeoutMs = 45_000) {
  await page.waitForFunction(
    () => Boolean(window.__VULU_SPACETIME_DEBUG__),
    { timeout: timeoutMs },
  );
}

async function readMyRolesFromDebug(page) {
  return await page.evaluate(() => {
    const debug = window.__VULU_SPACETIME_DEBUG__;
    const rows = Array.from(
      debug?.db?.myRoles?.iter?.() ?? debug?.db?.my_roles?.iter?.() ?? [],
    );
    return rows
      .map((row) => (typeof row?.role === 'string' ? row.role.trim().toLowerCase() : ''))
      .filter((role) => role.length > 0);
  });
}

async function readDebugSnapshot(page) {
  return await page.evaluate(() => {
    const debug = window.__VULU_SPACETIME_DEBUG__;
    const readRows = (table) => {
      if (!table || typeof table.iter !== 'function') {
        return [];
      }
      return Array.from(table.iter());
    };

    const myRolesRows = readRows(debug?.db?.myRoles ?? debug?.db?.my_roles).map((row) => ({
      id: typeof row?.id === 'string' ? row.id : '',
      vuluUserId:
        typeof row?.vuluUserId === 'string'
          ? row.vuluUserId
          : typeof row?.vulu_user_id === 'string'
            ? row.vulu_user_id
            : '',
      role: typeof row?.role === 'string' ? row.role.toLowerCase() : '',
    }));

    const myIdentityRows = readRows(debug?.db?.myIdentity ?? debug?.db?.my_identity).map((row) => ({
      id: typeof row?.id === 'string' ? row.id : '',
      vuluUserId:
        typeof row?.vuluUserId === 'string'
          ? row.vuluUserId
          : typeof row?.vulu_user_id === 'string'
            ? row.vulu_user_id
            : '',
      issuer: typeof row?.issuer === 'string' ? row.issuer : '',
      subject: typeof row?.subject === 'string' ? row.subject : '',
    }));

    let cachedSession = null;
    try {
      const raw = window.localStorage.getItem('vulu.auth.session');
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedSession =
          parsed && typeof parsed === 'object'
            ? {
                vuluUserId:
                  typeof parsed.vuluUserId === 'string'
                    ? parsed.vuluUserId
                    : typeof parsed.userId === 'string'
                      ? parsed.userId
                      : '',
                issuer: typeof parsed.issuer === 'string' ? parsed.issuer : '',
                subject: typeof parsed.subject === 'string' ? parsed.subject : '',
                emailAddress:
                  typeof parsed.emailAddress === 'string' ? parsed.emailAddress : '',
                roles: Array.isArray(parsed.roles)
                  ? parsed.roles.filter((value) => typeof value === 'string')
                  : [],
              }
            : null;
      }
    } catch {
      cachedSession = null;
    }

    return {
      isActive: Boolean(debug?.isActive),
      telemetry:
        typeof debug?.getTelemetrySnapshot === 'function' ? debug.getTelemetrySnapshot() : null,
      myRolesRows,
      myIdentityRows,
      cachedSession,
      dbKeys:
        debug?.db && typeof debug.db === 'object'
          ? Object.keys(debug.db).sort()
          : [],
    };
  });
}

async function tryResolveIdentityFromDebugSession(page) {
  return await page.evaluate(async () => {
    const debug = window.__VULU_SPACETIME_DEBUG__;
    if (!debug) {
      return { ok: false, reason: 'missing_debug' };
    }

    let cached = null;
    try {
      const raw = window.localStorage.getItem('vulu.auth.session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          cached = parsed;
        }
      }
    } catch {
      cached = null;
    }

    const issuer = typeof cached?.issuer === 'string' ? cached.issuer.trim() : '';
    const subject = typeof cached?.subject === 'string' ? cached.subject.trim() : '';
    const email =
      typeof cached?.emailAddress === 'string' ? cached.emailAddress.trim() : null;
    if (!issuer || !subject) {
      return { ok: false, reason: 'missing_cached_identity' };
    }

    const payload = {
      provider: 'clerk',
      issuer,
      subject,
      email: email && email.length > 0 ? email : null,
      emailVerified: true,
    };

    const reducer =
      debug?.reducers?.resolveOrCreateUserIdentity ??
      debug?.reducers?.resolve_or_create_user_identity ??
      null;
    if (typeof reducer === 'function') {
      try {
        const result = await reducer(payload);
        return { ok: true, source: 'reducer', result: result ?? null };
      } catch (error) {
        return {
          ok: false,
          source: 'reducer',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const procedure =
      debug?.procedures?.resolveOrCreateUserIdentitySync ??
      debug?.procedures?.resolve_or_create_user_identity_sync ??
      null;
    if (typeof procedure === 'function') {
      try {
        const result = await procedure(payload);
        return { ok: true, source: 'procedure', result: result ?? null };
      } catch (error) {
        return {
          ok: false,
          source: 'procedure',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { ok: false, reason: 'missing_identity_proc_and_reducer' };
  });
}

async function waitForRoles(page, predicate, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastRoles = [];
  while (Date.now() - startedAt < timeoutMs) {
    lastRoles = await readMyRolesFromDebug(page);
    if (predicate(lastRoles)) {
      return lastRoles;
    }
    await page.waitForTimeout(1000);
  }
  return lastRoles;
}

async function waitForAdminRoleWithRecovery(page, timeoutMs = 60_000, logEveryMs = 5_000) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let lastLoggedAt = 0;
  let resolveAttempted = false;

  while (Date.now() - startedAt < timeoutMs) {
    lastSnapshot = await readDebugSnapshot(page);
    const roles = lastSnapshot.myRolesRows
      .map((row) => (typeof row.role === 'string' ? row.role.toLowerCase() : ''))
      .filter((role) => role.length > 0);
    if (roles.includes('admin')) {
      return {
        roles,
        snapshot: lastSnapshot,
      };
    }

    const now = Date.now();
    if (now - lastLoggedAt >= logEveryMs) {
      lastLoggedAt = now;
      await log(
        `${LOG_PREFIX} waiting for admin role in my_roles: ` +
          `${JSON.stringify({
            isActive: lastSnapshot.isActive,
            telemetry: lastSnapshot.telemetry,
            myIdentityRows: lastSnapshot.myIdentityRows,
            myRolesRows: lastSnapshot.myRolesRows,
            cachedSession: lastSnapshot.cachedSession,
          })}`,
      );
    }

    if (!resolveAttempted) {
      resolveAttempted = true;
      const resolveResult = await tryResolveIdentityFromDebugSession(page);
      await log(
        `${LOG_PREFIX} resolve identity fallback result: ${JSON.stringify(resolveResult)}`,
      );
    }

    await page.waitForTimeout(1500);
  }

  return {
    roles: (lastSnapshot?.myRolesRows ?? [])
      .map((row) => (typeof row.role === 'string' ? row.role.toLowerCase() : ''))
      .filter((role) => role.length > 0),
    snapshot: lastSnapshot,
  };
}

async function grantAdminRoleViaReducer(page, targetVuluUserId) {
  const result = await page.evaluate(async (nextTargetVuluUserId) => {
    const debug = window.__VULU_SPACETIME_DEBUG__;
    const reducer =
      debug?.reducers?.setUserRole ??
      debug?.reducers?.set_user_role ??
      null;
    if (typeof reducer !== 'function') {
      return { ok: false, error: 'Reducer setUserRole is unavailable.' };
    }

    try {
      await reducer({
        targetUserId: nextTargetVuluUserId,
        role: 'admin',
        enabled: true,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, targetVuluUserId);

  if (!result?.ok) {
    fail(`Failed to grant admin role via reducer: ${result?.error ?? 'unknown error'}`);
  }
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function generateTotpCode(secret) {
  const key = decodeBase32(secret);
  const epochSeconds = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epochSeconds / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function ensureAdminGateUnlocked(page) {
  await page.evaluate((secret) => {
    window.localStorage.setItem('vulu_admin_totp_secret', secret);
  }, QA_TOTP_SECRET);
  const runtimeTotpSecret =
    (await page.evaluate(() => {
      try {
        const raw = window.localStorage.getItem('vulu_admin_totp_secret');
        return typeof raw === 'string' ? raw.trim() : '';
      } catch {
        return '';
      }
    })) || QA_TOTP_SECRET;
  await log(
    `${LOG_PREFIX} admin gate secret source=${
      runtimeTotpSecret === QA_TOTP_SECRET ? 'qa_default' : 'runtime_storage'
    }`,
  );

  const setupVisibleBefore = await page
    .getByText('Authenticator Setup')
    .isVisible({ timeout: 1200 })
    .catch(() => false);
  if (setupVisibleBefore) {
    await log(`${LOG_PREFIX} detected first-time Authenticator Setup; reloading with seeded TOTP secret`);
    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
  }

  const deniedVisible = await page
    .getByText('Access Denied')
    .isVisible({ timeout: 1200 })
    .catch(() => false);
  if (deniedVisible) {
    fail('Admin gate still shows Access Denied after role assignment.');
  }

  const codeInput = page.getByPlaceholder('000 000');
  const codeInputVisible = await codeInput.isVisible({ timeout: 2500 }).catch(() => false);
  if (codeInputVisible) {
    const unlockButton = page
      .getByRole('button', { name: /Unlock 2FA|Verify & Save|Verify Access/i })
      .first();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const codeInputStillPresent = await codeInput.isVisible({ timeout: 1200 }).catch(() => false);
      if (!codeInputStillPresent) {
        await log(`${LOG_PREFIX} admin gate code input no longer visible on attempt ${attempt}; assuming transition`);
        break;
      }

      const code = generateTotpCode(runtimeTotpSecret);
      await codeInput.fill(code, { timeout: 2000 });
      await codeInput.press('Enter').catch(() => {});
      const unlockVisible = await unlockButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (unlockVisible) {
        await unlockButton.click().catch(() => {});
      }

      const eventsVisible = await page
        .getByText(/^Events$/i)
        .first()
        .isVisible({ timeout: 6000 })
        .catch(() => false);
      const adminMarkerVisibleDuringAttempt = await page
        .getByText(/Admin Operations|Workspaces/i)
        .first()
        .isVisible({ timeout: 1200 })
        .catch(() => false);
      const inputStillVisibleAfterSubmit = await codeInput
        .isVisible({ timeout: 1200 })
        .catch(() => false);
      if (eventsVisible || adminMarkerVisibleDuringAttempt || !inputStillVisibleAfterSubmit) {
        break;
      }

      const gateError = await page
        .locator('text=/Invalid code|attempts remaining|Please enter the 6-digit code/i')
        .first()
        .textContent()
        .catch(() => null);
      await log(
        `${LOG_PREFIX} admin gate attempt ${attempt} pending; error=${(gateError ?? '').trim() || '(none)'}`,
      );
      await page.waitForTimeout(1200);
    }
  }

  const eventsTabVisible = await page
    .getByText(/^Events$/i)
    .first()
    .isVisible({ timeout: 30_000 })
    .catch(() => false);
  if (eventsTabVisible) {
    return;
  }

  const adminMarkerVisible = await page
    .getByText(/Admin Operations|Workspaces/i)
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (adminMarkerVisible) {
    return;
  }

  const bodySnippet = await page
    .locator('body')
    .innerText()
    .then((text) => text.slice(0, 600).replaceAll('\n', ' '))
    .catch(() => '(body unavailable)');
  fail(`Admin gate unlock verification failed; url=${page.url()} body=${bodySnippet}`);
}

async function clickEventsTab(page) {
  const eventsTab = page.getByText(/^Events$/i).first();
  await eventsTab.waitFor({ timeout: 30_000 });
  await eventsTab.click();
}

async function waitForEventsTabReady(page) {
  await page
    .getByText('Event engine')
    .waitFor({ timeout: 20_000 });
}

async function saveEventConfig(page, targetConfig) {
  const draftEnabledTrue = await page
    .getByText(/Draft enabled:\s*true/i)
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (draftEnabledTrue !== targetConfig.enabled) {
    await page.getByText(/Enable widget|Disable widget/i).first().click();
  }

  const draftAutoplayTrue = await page
    .getByText(/Draft autoplay enabled:\s*true/i)
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (draftAutoplayTrue !== targetConfig.autoplayEnabled) {
    await page.getByText(/Enable autoplay|Disable autoplay/i).first().click();
  }

  await page
    .getByPlaceholder('Entry amount (cash)')
    .fill(String(targetConfig.entryAmountCash));
  await page
    .getByPlaceholder('Draw duration minutes')
    .fill(String(targetConfig.drawDurationMinutes));
  await page
    .getByPlaceholder('Draw interval minutes')
    .fill(String(targetConfig.drawIntervalMinutes));

  await page.getByText('Save Event Configuration').first().click();
  await page.getByText('Event configuration saved.').waitFor({ timeout: 30_000 });
}

async function readCurrentEventConfig(page) {
  return await page.evaluate(() => {
    const debug = window.__VULU_SPACETIME_DEBUG__;
    const rows = Array.from(
      debug?.db?.eventWidgetConfigItem?.iter?.() ??
        debug?.db?.event_widget_config_item?.iter?.() ??
        [],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      enabled: Boolean(row.enabled),
      entryAmountCash: Number(row.entryAmountCash ?? 0),
      drawDurationMinutes: Number(row.drawDurationMinutes ?? 3),
      drawIntervalMinutes: Number(row.drawIntervalMinutes ?? 3),
      autoplayEnabled: Boolean(row.autoplayEnabled),
      updatedBy: typeof row.updatedBy === 'string' ? row.updatedBy : '',
    };
  });
}

async function run() {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!clerkSecretKey) {
    fail('Missing CLERK_SECRET_KEY. Run with `node --env-file=.env.local ...`.');
  }

  if (!(await fileExists(SPACETIME_BIN))) {
    fail(`Spacetime CLI not found at ${SPACETIME_BIN}`);
  }

  await mkdir(QA_EVIDENCE_DIR, { recursive: true });
  await writeFile(LOG_FILE, '');
  await log(`${LOG_PREFIX} starting admin signoff flow`);

  const qaProfile = await provisionQaUser(clerkSecretKey);
  await log(
    `${LOG_PREFIX} provisioned QA Clerk user clerk_user_id=${qaProfile.clerkUserId} email=${qaProfile.email}`,
  );

  let expo = null;
  const restartExpoWithTicket = async (signInTicket, label) => {
    if (expo) {
      await stopProcess(expo);
      expo = null;
    }
    expo = startExpoWithTicket(signInTicket);
    await waitForUrl(`${QA_BASE_URL}/`, 120_000);
    await log(`${LOG_PREFIX} web reachable (${label}) at ${QA_BASE_URL}`);
  };

  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });

    // 1) Login QA user (non-admin), capture Access Denied.
    const qaTicketBefore = await createSignInTicket(clerkSecretKey, qaProfile.clerkUserId);
    await log(`${LOG_PREFIX} generated QA sign-in ticket (pre-assignment) for ${qaProfile.clerkUserId}`);
    await restartExpoWithTicket(qaTicketBefore, 'qa-pre');

    const qaPreContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1440, height: 900 },
    });
    const qaPrePage = await qaPreContext.newPage();
    const qaSession = await loginWithTicket(qaPrePage);
    const qaVuluUserId = qaSession?.vuluUserId;
    if (!qaVuluUserId) {
      fail('Failed to resolve QA vulu_user_id from session cache.');
    }
    await log(`${LOG_PREFIX} QA user mapped to vulu_user_id=${qaVuluUserId}`);

    await qaPrePage.goto(`${QA_BASE_URL}/admin-v2`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await qaPrePage.getByText('Access Denied').waitFor({ timeout: 20_000 });
    await qaPrePage.screenshot({ path: BEFORE_DENIED_SCREENSHOT, fullPage: true });
    await log(`${LOG_PREFIX} captured Access Denied screenshot: ${BEFORE_DENIED_SCREENSHOT}`);

    await runSql(
      `SELECT id, vulu_user_id, role, granted_at, granted_by FROM user_role WHERE vulu_user_id = '${qaVuluUserId}'`,
      ROLE_BEFORE_FILE,
    );

    await qaPreContext.close();

    // 2) Assign admin role directly in DB for deterministic QA role provisioning.
    await runSql(
      `UPDATE user_role SET id = '${qaVuluUserId}::admin', role = 'admin' WHERE id = '${qaVuluUserId}::user'`,
      ROLE_AFTER_FILE,
    );
    await waitForSqlContains(
      `SELECT id, vulu_user_id, role, granted_at, granted_by FROM user_role WHERE vulu_user_id = '${qaVuluUserId}'`,
      ROLE_AFTER_FILE,
      '"admin"',
      45_000,
    );
    await log(`${LOG_PREFIX} SQL role assignment set ${qaVuluUserId} => admin`);

    // 3) Re-login QA user, verify my_roles includes admin, complete admin gate, write event config.
    const qaTicketAfter = await createSignInTicket(clerkSecretKey, qaProfile.clerkUserId);
    await log(`${LOG_PREFIX} generated QA sign-in ticket (post-assignment) for ${qaProfile.clerkUserId}`);
    await restartExpoWithTicket(qaTicketAfter, 'qa-post');

    const qaPostContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1440, height: 900 },
    });
    const qaPostPage = await qaPostContext.newPage();
    const qaPostSession = await loginWithTicket(qaPostPage);
    if (qaPostSession?.vuluUserId !== qaVuluUserId) {
      fail(
        `Unexpected QA vulu_user_id on second login: expected=${qaVuluUserId} got=${qaPostSession?.vuluUserId}`,
      );
    }
    await qaPostPage.goto(`${QA_BASE_URL}/`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await qaPostPage.waitForTimeout(2500);
    await qaPostPage.evaluate((secret) => {
      window.localStorage.setItem('vulu_admin_totp_secret', secret);
    }, QA_TOTP_SECRET);

    await waitForDebugHandle(qaPostPage);
    await qaPostPage.goto(`${QA_BASE_URL}/admin-v2`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await qaPostPage.waitForTimeout(1200);
    const roleResult = await waitForAdminRoleWithRecovery(qaPostPage, 70_000);
    const qaRoles = roleResult.roles;
    await log(`${LOG_PREFIX} QA my_roles=${JSON.stringify(qaRoles)}`);
    await log(`${LOG_PREFIX} post-role page url=${qaPostPage.url()}`);
    if (!qaRoles.includes('admin')) {
      fail(
        `QA my_roles is missing admin: ${JSON.stringify(qaRoles)} debug=${JSON.stringify(
          roleResult.snapshot,
        )}`,
      );
    }

    await ensureAdminGateUnlocked(qaPostPage);
    await qaPostPage.screenshot({ path: AFTER_ACCESS_SCREENSHOT, fullPage: true });
    await log(`${LOG_PREFIX} captured Admin access screenshot: ${AFTER_ACCESS_SCREENSHOT}`);

    await clickEventsTab(qaPostPage);
    await waitForEventsTabReady(qaPostPage);

    await runSql(
      'SELECT id, enabled, entry_amount_cash, draw_duration_minutes, draw_interval_minutes, autoplay_enabled, updated_by, updated_at FROM event_widget_config_item',
      CONFIG_BEFORE_FILE,
    );

    const currentConfig = (await readCurrentEventConfig(qaPostPage)) ?? {
      enabled: true,
      entryAmountCash: 0,
      drawDurationMinutes: 3,
      drawIntervalMinutes: 3,
      autoplayEnabled: true,
    };
    const targetConfig = {
      enabled: !currentConfig.enabled,
      entryAmountCash: currentConfig.entryAmountCash === 137 ? 138 : 137,
      drawDurationMinutes:
        currentConfig.drawDurationMinutes === 9 ? 10 : 9,
      drawIntervalMinutes:
        currentConfig.drawIntervalMinutes === 4 ? 5 : 4,
      autoplayEnabled: !currentConfig.autoplayEnabled,
    };
    if (targetConfig.drawIntervalMinutes > targetConfig.drawDurationMinutes) {
      targetConfig.drawIntervalMinutes = targetConfig.drawDurationMinutes;
    }
    await log(
      `${LOG_PREFIX} event config target=${JSON.stringify(targetConfig)} current=${JSON.stringify(
        currentConfig,
      )}`,
    );

    await saveEventConfig(qaPostPage, targetConfig);
    await qaPostPage.screenshot({ path: AFTER_WRITE_SCREENSHOT, fullPage: true });
    await log(`${LOG_PREFIX} captured Events write screenshot: ${AFTER_WRITE_SCREENSHOT}`);

    const expectedEnabledAction = targetConfig.enabled
      ? 'event_widget_enabled'
      : 'event_widget_disabled';

    await waitForSqlContains(
      `SELECT id, enabled, entry_amount_cash, draw_duration_minutes, draw_interval_minutes, autoplay_enabled, updated_by, updated_at FROM event_widget_config_item WHERE updated_by = '${qaVuluUserId}'`,
      CONFIG_AFTER_FILE,
      String(targetConfig.entryAmountCash),
      45_000,
    );
    await waitForSqlContains(
      `SELECT id, action, actor_user_id, created_at, item FROM event_widget_config_audit_item WHERE actor_user_id = '${qaVuluUserId}'`,
      AUDIT_AFTER_FILE,
      'event_widget_config_updated',
      45_000,
    );
    await waitForSqlContains(
      `SELECT id, action, actor_user_id, created_at, item FROM event_widget_config_audit_item WHERE actor_user_id = '${qaVuluUserId}'`,
      AUDIT_AFTER_FILE,
      expectedEnabledAction,
      45_000,
    );

    await qaPostContext.close();

    await log(`${LOG_PREFIX} completed successfully`);
    await log(
      `${LOG_PREFIX} artifacts: ${JSON.stringify({
        log: LOG_FILE,
        beforeDeniedScreenshot: BEFORE_DENIED_SCREENSHOT,
        afterAccessScreenshot: AFTER_ACCESS_SCREENSHOT,
        afterWriteScreenshot: AFTER_WRITE_SCREENSHOT,
        roleBefore: ROLE_BEFORE_FILE,
        roleAfter: ROLE_AFTER_FILE,
        configBefore: CONFIG_BEFORE_FILE,
        configAfter: CONFIG_AFTER_FILE,
        auditAfter: AUDIT_AFTER_FILE,
      })}`,
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    if (expo) {
      await stopProcess(expo);
    }
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} FAILED: ${message}`);
  try {
    await log(`${LOG_PREFIX} FAILED: ${message}`);
  } catch {}
  process.exit(1);
});
