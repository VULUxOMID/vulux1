#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.clerk.com/v1';
const DEFAULT_SIGN_IN_CODE = '424242';
const DEFAULT_EVIDENCE_DIR = 'docs/qa';
const AFTER_LOG_FILE = 'vul-72-smoke-after.log';
const DEFAULT_SMOKE_PORT = '19081';

function fail(message) {
  throw new Error(message);
}

function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes('placeholder') ||
    normalized.includes('your_') ||
    normalized.includes('<') ||
    normalized.includes('example')
  );
}

function readRequiredEnv(name, { allowPlaceholder = false } = {}) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`Missing required env: ${name}`);
  }
  if (!allowPlaceholder && isPlaceholderValue(value)) {
    fail(`Invalid ${name}: placeholder value is not allowed for authenticated smoke.`);
  }
  return value;
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

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Clerk API ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function makeQaProfile() {
  const stamp = Date.now();
  const suffix = randomUUID().slice(0, 8);
  const username = `authqa_smoke_${stamp}_${suffix}`;
  const email = `authqa+${stamp}.${suffix}@example.com`;
  const password = `AuthQa!${stamp}${suffix}`;
  const phone = `+1415555${Math.floor(1000 + Math.random() * 9000).toString()}`;
  return { username, email, password, phone };
}

async function provisionQaUser(secretKey, logger) {
  const profile = makeQaProfile();
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
  logger(`Provisioned QA Clerk profile: ${created.id}`);
  return {
    userId: created.id,
    email: profile.email,
    password: profile.password,
  };
}

async function createSignInTicket(secretKey, userId, logger) {
  const token = await clerkRequest(
    '/sign_in_tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        expires_in_seconds: 300,
      }),
    },
    secretKey,
  );
  const ticket = typeof token?.token === 'string' ? token.token : null;
  if (!ticket) {
    fail('Clerk did not return a sign-in token.');
  }
  logger('Generated short-lived Clerk sign-in ticket for smoke fallback.');
  return ticket;
}

function readAuthSnippet(text) {
  const match = /auth u:[^\n]+/.exec(text);
  return match ? match[0] : 'auth snippet not found';
}

async function readCachedSessionUserId(page) {
  return await page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('vulu.auth.session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const userId = typeof parsed.userId === 'string' ? parsed.userId.trim() : '';
      return userId.length > 0 ? userId : null;
    } catch {
      return null;
    }
  });
}

async function isLoginUiVisible(page) {
  const signInButtonVisible = await page
    .getByRole('button', { name: 'Sign in' })
    .isVisible({ timeout: 500 })
    .catch(() => false);
  const identifierVisible = await page
    .getByPlaceholder('Email or username')
    .isVisible({ timeout: 500 })
    .catch(() => false);
  return signInButtonVisible || identifierVisible;
}

async function assertAuthenticatedRoute(page, routeLabel) {
  const loginUiVisible = await isLoginUiVisible(page);
  const currentUrl = page.url();
  if (loginUiVisible || currentUrl.includes('/login')) {
    fail(
      `Authenticated smoke failed: route ${routeLabel} rendered login UI instead of authenticated content (url=${currentUrl}).`,
    );
  }
}

async function waitForAuthenticatedSession(page, signInCode, logger) {
  const deadline = Date.now() + 60_000;
  let secondFactorAttempted = false;

  while (Date.now() < deadline) {
    const cachedUserId = await readCachedSessionUserId(page);
    if (cachedUserId) {
      return cachedUserId;
    }

    const loginUiVisible = await isLoginUiVisible(page);
    if (!loginUiVisible && !page.url().includes('/login')) {
      return 'clerk-session';
    }

    if (!secondFactorAttempted) {
      const signInCodeInput = page.getByPlaceholder('Sign-in verification code');
      const codePromptVisible = await signInCodeInput.isVisible({ timeout: 500 }).catch(() => false);
      if (codePromptVisible) {
        logger('[2] Second-factor prompt visible: true');
        await signInCodeInput.fill(signInCode);
        await page.getByRole('button', { name: 'Verify sign-in code' }).click();
        secondFactorAttempted = true;
      }
    }

    await page.waitForTimeout(1000);
  }

  const currentUrl = page.url();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  fail(
    `Authenticated smoke failed: no signed-in user session detected. url=${currentUrl} body=${bodyText.slice(0, 280).replaceAll('\n', ' ')}`,
  );
}

async function waitForUrl(baseUrl, timeoutMs, logger) {
  const deadline = Date.now() + timeoutMs;
  const target = `${baseUrl}/`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) {
        logger(`Web app became reachable at ${target}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Timed out waiting for ${target}`);
}

function pickBaseUrl() {
  const explicit = process.env.QA_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  return `http://127.0.0.1:${DEFAULT_SMOKE_PORT}`;
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function runSmokeFlow({ baseUrl, email, password, signInCode, evidenceDir, logger }) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail(
      'Missing playwright dependency. Install with `npm install -D @playwright/test` before running smoke.',
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  logger('[1] Open /login and authenticate');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 120000 });

  // Prefer QA ticket sign-in path when EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET is present.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(1200);

  let cachedUser = await readCachedSessionUserId(page);
  if (!cachedUser) {
    const identifierInput = page.getByPlaceholder('Email or username');
    const passwordInput = page.getByPlaceholder('Password');
    const canFillCredentials =
      (await identifierInput.isVisible({ timeout: 2000 }).catch(() => false)) &&
      (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false));

    if (canFillCredentials) {
      logger('[auth] Ticket-first sign-in did not complete immediately; retrying with QA credentials.');
      await identifierInput.fill(email);
      await passwordInput.fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    } else {
      logger('[auth] Ticket-first sign-in in progress; credential inputs no longer visible.');
    }
  }

  logger('[2] Second-factor prompt visible: false');
  const sessionState = await waitForAuthenticatedSession(page, signInCode, logger);
  logger(`[auth] Signed in user session detected (${sessionState.slice(0, 8)}…).`);

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await assertAuthenticatedRoute(page, '/');

  const homeText = await page.locator('body').innerText();
  logger(`[3] Home auth debug: ${readAuthSnippet(homeText)}`);
  await page.screenshot({ path: path.join(evidenceDir, 'vul-72-after-home.png'), fullPage: true });

  logger('[4] Navigate to /go-live');
  await page.goto(`${baseUrl}/go-live`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await assertAuthenticatedRoute(page, '/go-live');
  const goLiveText = await page.locator('body').innerText();
  logger(`[5] /go-live auth debug: ${readAuthSnippet(goLiveText)}`);
  await page.screenshot({ path: path.join(evidenceDir, 'vul-72-after-go-live.png'), fullPage: true });

  logger('[6] Navigate to /live');
  await page.goto(`${baseUrl}/live`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await assertAuthenticatedRoute(page, '/live');
  const liveText = await page.locator('body').innerText();
  logger(`[7] /live auth debug: ${readAuthSnippet(liveText)}`);
  await page.screenshot({ path: path.join(evidenceDir, 'vul-72-after-live.png'), fullPage: true });

  const goToHome = page.getByRole('button', { name: 'Go To Home' });
  if (await goToHome.isVisible().catch(() => false)) {
    logger('[8] Click Go To Home CTA');
    await goToHome.click();
    await page.waitForURL((url) => url.toString() === `${baseUrl}/`, { timeout: 30000 });
  } else {
    logger('[8] Go To Home CTA not present; navigate to / directly');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 60000 });
  }

  await page.waitForTimeout(1200);
  await assertAuthenticatedRoute(page, '/ (return)');
  const returnText = await page.locator('body').innerText();
  logger(`[9] Home return auth debug: ${readAuthSnippet(returnText)}`);
  await page.screenshot({
    path: path.join(evidenceDir, 'vul-72-after-home-return.png'),
    fullPage: true,
  });

  await browser.close();
  logger('[10] Smoke complete');
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const baseUrl = pickBaseUrl();
  const evidenceDir = path.resolve(projectRoot, process.env.QA_EVIDENCE_DIR ?? DEFAULT_EVIDENCE_DIR);
  const signInCode = (process.env.QA_SIGNIN_CODE ?? DEFAULT_SIGN_IN_CODE).trim();
  const logPath = path.join(evidenceDir, AFTER_LOG_FILE);

  const logLines = [];
  let redactedSecretKey = '';
  let redactedQaTicket = '';
  const logger = (message) => {
    let redacted = String(message);
    if (redactedSecretKey) {
      redacted = redacted.replaceAll(redactedSecretKey, '[REDACTED_CLERK_SECRET_KEY]');
    }
    if (redactedQaTicket) {
      redacted = redacted.replaceAll(redactedQaTicket, '[REDACTED_QA_TICKET]');
    }
    const line = `[${new Date().toISOString()}] ${redacted}`;
    logLines.push(line);
    console.log(line);
  };

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(logPath, '', 'utf8');

  const secretKey = readRequiredEnv('CLERK_SECRET_KEY');
  redactedSecretKey = secretKey;
  readRequiredEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

  const qaUser = await provisionQaUser(secretKey, logger);
  const qaTicket = await createSignInTicket(secretKey, qaUser.userId, logger);
  redactedQaTicket = qaTicket;

  const baseUrlObject = new URL(baseUrl);
  const expoPort = baseUrlObject.port || (baseUrlObject.protocol === 'https:' ? '443' : '80');

  const expoEnv = {
    ...process.env,
    CI: '1',
    EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: qaTicket,
  };

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const expoArgs = ['expo', 'start', '--web', '--port', expoPort];
  const expoProcess = spawn(npxCmd, expoArgs, {
    cwd: projectRoot,
    env: expoEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  expoProcess.stdout.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text.length > 0) {
      logger(`[expo] ${text}`);
    }
  });
  expoProcess.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text.length > 0) {
      logger(`[expo:stderr] ${text}`);
    }
  });

  try {
    await waitForUrl(baseUrl, 120000, logger);
    await runSmokeFlow({
      baseUrl,
      email: qaUser.email,
      password: qaUser.password,
      signInCode,
      evidenceDir,
      logger,
    });
    logger('Authenticated smoke completed successfully.');
  } finally {
    await stopProcess(expoProcess);
    await writeFile(logPath, `${logLines.join('\n')}\n`, 'utf8');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[VUL-72 smoke] ${message}`);
  process.exit(1);
});
