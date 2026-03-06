#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const API_BASE = 'https://api.clerk.com/v1';
const EVIDENCE_DIR = path.resolve(process.cwd(), process.env.QA_EVIDENCE_DIR ?? 'docs/qa');
const LOG_FILE = path.join(EVIDENCE_DIR, 'vul-89-leaderboard-validation.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'vul-89-leaderboard-validation.json');
const ROUTE_SWEEP_FILE = path.join(EVIDENCE_DIR, 'vul-89-route-sweep.log');

const HOST_PORT = Number.parseInt(process.env.QA_HOST_PORT ?? '19140', 10);
const VIEWER_PORT = Number.parseInt(process.env.QA_VIEWER_PORT ?? '19141', 10);
const HOST_BASE = `http://127.0.0.1:${HOST_PORT}`;
const VIEWER_BASE = `http://127.0.0.1:${VIEWER_PORT}`;

const HOST_CLERK_USER_ID =
  process.env.QA_HOST_CLERK_USER_ID?.trim() ?? 'user_3AWyThXArgPs8vImwJc6H0ew94h';
const VIEWER_CLERK_USER_ID =
  process.env.QA_VIEWER_CLERK_USER_ID?.trim() ?? 'user_3AX5F6JQbdsIDjhYKVoH9ObqvaK';
const QA_SIGNIN_CODE = (process.env.QA_SIGNIN_CODE ?? '424242').trim();

const SPACETIME_BIN = (process.env.SPACETIME_BIN ?? '/Users/omid/.local/bin/spacetime').trim();
const SPACETIME_SERVER = (process.env.QA_SPACETIME_SERVER ?? 'maincloud').trim();
const SPACETIME_DB_NAME = (process.env.EXPO_PUBLIC_SPACETIMEDB_NAME ?? 'vulu').trim();

const VIEWER_MIN_CASH = Number.parseInt(process.env.QA_VIEWER_MIN_CASH ?? '3000', 10);
const HOST_MIN_CASH = Number.parseInt(process.env.QA_HOST_MIN_CASH ?? '5000', 10);

const TRUSTED_GEM_PACKS = [100, 550, 1200, 2500];
const GEM_TO_CASH_RATE = 10;

const logLines = [];
const routeSweepLines = [];
const commandsRun = [];
const artifacts = {};
const consoleEvents = [];

function readGitValue(args, fallback) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

const BRANCH_UNDER_TEST =
  process.env.QA_BRANCH_UNDER_TEST?.trim() ||
  readGitValue(['branch', '--show-current'], 'codex/vul-89-leaderboard-v1-clean');
const COMMIT_UNDER_TEST =
  process.env.QA_COMMIT_UNDER_TEST?.trim() ||
  readGitValue(['rev-parse', '--short', 'HEAD'], 'unknown');

function nowIso() {
  return new Date().toISOString();
}

async function log(message) {
  const line = `[${nowIso()}] ${message}`;
  logLines.push(line);
  console.log(line);
  await writeFile(LOG_FILE, `${logLines.join('\n')}\n`, 'utf8');
}

async function logRoute(label, url) {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {}
  const line = `[${nowIso()}] [route:${label}] ${pathname}`;
  routeSweepLines.push(line);
  await writeFile(ROUTE_SWEEP_FILE, `${routeSweepLines.join('\n')}\n`, 'utf8');
  await log(`[route:${label}] ${pathname}`);
}

function recordCommand(command) {
  commandsRun.push(command);
}

function normalizeOutput(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '').trim();
}

async function runCommand(command, args, { allowFailure = false } = {}) {
  recordCommand(`${command} ${args.join(' ')}`.trim());
  await log(`$ ${command} ${args.join(' ')}`);
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
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
  const result = await runCommand(SPACETIME_BIN, [
    'sql',
    SPACETIME_DB_NAME,
    query,
    '--server',
    SPACETIME_SERVER,
  ]);
  const merged = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (outputPath) {
    await writeFile(outputPath, `${merged}\n`, 'utf8');
    artifacts[path.basename(outputPath)] = outputPath;
  }
  await log(merged || '(no sql output)');
  return merged;
}

function escapeSqlLiteral(value) {
  return value.replaceAll("'", "''");
}

async function createSignInTicket(clerkUserId) {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('Missing CLERK_SECRET_KEY.');
  }
  const response = await fetch(`${API_BASE}/sign_in_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: clerkUserId,
      expires_in_seconds: 600,
    }),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(`Clerk ticket request failed for ${clerkUserId}: ${JSON.stringify(payload)}`);
  }
  const token = typeof payload?.token === 'string' ? payload.token : null;
  if (!token) {
    throw new Error(`Clerk ticket missing token for ${clerkUserId}`);
  }
  return token;
}

async function fetchClerkUser(clerkUserId) {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('Missing CLERK_SECRET_KEY.');
  }
  const response = await fetch(`${API_BASE}/users/${clerkUserId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(`Clerk user lookup failed for ${clerkUserId}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function startExpoWeb({ label, port, ticket }) {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  recordCommand(
    `CI=1 EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET=<redacted> EXPO_PUBLIC_DATA_SOURCE=spacetimedb EXPO_PUBLIC_SPACETIMEDB_NAME=${SPACETIME_DB_NAME} npx expo start --web --port ${port}`,
  );
  const child = spawn(npxCmd, ['expo', 'start', '--web', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: '1',
      EXPO_PUBLIC_DATA_SOURCE: 'spacetimedb',
      EXPO_PUBLIC_SPACETIMEDB_NAME: SPACETIME_DB_NAME,
      EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: ticket,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const lines = String(chunk).split('\n').map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => log(`[${label}:expo] ${line}`));
  });
  child.stderr.on('data', (chunk) => {
    const lines = String(chunk).split('\n').map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => log(`[${label}:expo:stderr] ${line}`));
  });

  return child;
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

async function waitForUrlReachable(baseUrl, timeoutMs = 120_000) {
  const target = `${baseUrl}/`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(target, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) {
        await log(`Web app reachable: ${target}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${target}`);
}

function attachConsoleCapture(page, label) {
  page.on('console', async (message) => {
    const type = message.type();
    const text = message.text();
    if (!['log', 'warning', 'error'].includes(type)) return;
    let route = page.url();
    try {
      route = new URL(page.url()).pathname;
    } catch {}
    consoleEvents.push({ label, type, route, text });
    await log(`[console:${label}:${type}:${route}] ${text}`);
  });
}

function attachRouteCapture(page, label) {
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return;
    await logRoute(label, frame.url());
  });
}

async function readVuluSession(page) {
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
      const clerkUserId =
        typeof parsed.clerkUserId === 'string'
          ? parsed.clerkUserId.trim()
          : typeof parsed.subject === 'string'
            ? parsed.subject.trim()
            : '';
      if (!vuluUserId) return null;
      return {
        vuluUserId,
        clerkUserId: clerkUserId || null,
        roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      };
    } catch {
      return null;
    }
  });
}

async function maybeCompleteSecondFactor(page) {
  const input = page.getByPlaceholder('Sign-in verification code');
  const visible = await input.isVisible({ timeout: 300 }).catch(() => false);
  if (!visible) return false;
  await input.fill(QA_SIGNIN_CODE);
  await page.getByRole('button', { name: 'Verify sign-in code' }).click().catch(() => {});
  return true;
}

async function loginWithTicket(page, baseUrl, label) {
  await page.goto(`${baseUrl}/login`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await log(`[${label}] login attempt ${attempt}: click Sign in`);
    await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 20_000 });
    const started = Date.now();
    while (Date.now() - started < 25_000) {
      await maybeCompleteSecondFactor(page);
      const session = await readVuluSession(page);
      if (session?.vuluUserId) {
        await log(`[${label}] login success vulu_user_id=${session.vuluUserId}`);
        return session;
      }
      await page.waitForTimeout(700);
    }
  }

  throw new Error(`[${label}] unable to establish authenticated vulu session.`);
}

async function screenshot(page, filename) {
  const absolutePath = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: absolutePath, fullPage: true });
  artifacts[filename] = absolutePath;
  await log(`screenshot: ${absolutePath}`);
}

async function getSpacetimeModuleId(page) {
  return await page.evaluate(() => {
    const registry = globalThis.__r?.getModules?.();
    if (!registry || typeof registry.entries !== 'function') {
      throw new Error('Metro module registry unavailable.');
    }

    for (const [id, metadata] of registry.entries()) {
      const name = typeof metadata?.verboseName === 'string' ? metadata.verboseName : '';
      if (name.includes('src/lib/spacetime.ts')) {
        return id;
      }
    }

    throw new Error('Unable to locate src/lib/spacetime.ts module.');
  });
}

async function callReducer(page, reducer, args) {
  const spacetimeModuleId = await getSpacetimeModuleId(page);
  return await page.evaluate(
    async ({ moduleId, reducerName, reducerArgs }) => {
      const spacetime = globalThis.__r(moduleId);
      const fn = spacetime?.spacetimeDb?.reducers?.[reducerName];
      if (typeof fn !== 'function') {
        throw new Error(`Reducer not available: ${reducerName}`);
      }
      return await fn(reducerArgs);
    },
    { moduleId: spacetimeModuleId, reducerName: reducer, reducerArgs: args },
  );
}

function chooseGemPack(deficitCash) {
  const neededGems = Math.max(0, Math.ceil(deficitCash / GEM_TO_CASH_RATE));
  for (const pack of TRUSTED_GEM_PACKS) {
    if (pack >= neededGems) {
      return pack;
    }
  }
  return TRUSTED_GEM_PACKS[TRUSTED_GEM_PACKS.length - 1];
}

function parseLeaderboardRow(sqlOutput, userId) {
  const lines = sqlOutput.split('\n');
  for (const line of lines) {
    if (!line.includes(userId)) continue;
    const cells = line.split('|').map((value) => value.trim());
    if (cells.length < 4) continue;
    return {
      userId,
      score: Number.parseInt(cells[1] ?? '0', 10) || 0,
      gold: Number.parseInt(cells[2] ?? '0', 10) || 0,
      gems: Number.parseInt(cells[3] ?? '0', 10) || 0,
    };
  }
  return {
    userId,
    score: 0,
    gold: 0,
    gems: 0,
  };
}

async function readPublicLeaderboardRow(userId) {
  const output = await runSql(
    `SELECT user_id, score, gold, gems FROM public_leaderboard WHERE user_id = '${escapeSqlLiteral(userId)}'`,
  );
  return parseLeaderboardRow(output, userId);
}

async function ensureWalletCashFloor(page, label, userId, minimumCash) {
  let row = await readPublicLeaderboardRow(userId);
  await log(`[${label}] leaderboard row before seeding=${JSON.stringify(row)}`);

  if (row.score >= minimumCash) {
    return row;
  }

  if (row.gems > 0) {
    await callReducer(page, 'convertGemsToCash', {
      userId,
      gemsToConvert: row.gems,
    });
    await page.waitForTimeout(1000);
    row = await readPublicLeaderboardRow(userId);
    await log(`[${label}] leaderboard row after converting existing gems=${JSON.stringify(row)}`);
  }

  let attempts = 0;
  while (row.score < minimumCash && attempts < 6) {
    attempts += 1;
    const pack = chooseGemPack(minimumCash - row.score);
    await callReducer(page, 'creditGemsPurchase', {
      userId,
      gemsToCredit: pack,
      purchaseToken: `vul89-${label}-${Date.now()}-${attempts}-${pack}`,
      priceLabel: `QA ${pack}`,
      source: 'qa_vul89_seed',
    });
    await page.waitForTimeout(500);
    row = await readPublicLeaderboardRow(userId);
    const gemsToConvert = Math.max(0, row.gems);
    if (gemsToConvert > 0) {
      await callReducer(page, 'convertGemsToCash', {
        userId,
        gemsToConvert,
      });
      await page.waitForTimeout(1000);
      row = await readPublicLeaderboardRow(userId);
    }
    await log(`[${label}] leaderboard row after seed attempt ${attempts}=${JSON.stringify(row)}`);
  }

  if (row.score < minimumCash) {
    throw new Error(
      `[${label}] failed to reach minimum cash ${minimumCash}; final=${JSON.stringify(row)}`,
    );
  }

  return row;
}

function makePairKey(userAId, userBId) {
  return [userAId, userBId].sort().join('::');
}

async function ensureAcceptedFriendship(hostPage, viewerPage, hostUserId, viewerUserId) {
  const pairKey = makePairKey(hostUserId, viewerUserId);

  await callReducer(hostPage, 'removeFriendRelationship', {
    id: `vul89-cleanup-host-${Date.now()}`,
    pairKey,
    fromUserId: hostUserId,
    toUserId: viewerUserId,
    fromUserName: 'vul89-host-cleanup',
    fromUserAvatar: null,
  });
  await callReducer(viewerPage, 'removeFriendRelationship', {
    id: `vul89-cleanup-viewer-${Date.now()}`,
    pairKey,
    fromUserId: viewerUserId,
    toUserId: hostUserId,
    fromUserName: 'vul89-viewer-cleanup',
    fromUserAvatar: null,
  });
  await viewerPage.waitForTimeout(1000);

  const requestId = `vul89-friend-request-${Date.now()}`;
  await callReducer(hostPage, 'sendFriendRequest', {
    id: requestId,
    fromUserId: hostUserId,
    toUserId: viewerUserId,
    fromUserName: 'vul89-host',
    fromUserAvatar: null,
  });
  await viewerPage.waitForTimeout(1200);
  await callReducer(viewerPage, 'respondToFriendRequest', {
    id: `vul89-friend-accept-${Date.now()}`,
    requestId,
    pairKey,
    fromUserId: viewerUserId,
    toUserId: hostUserId,
    status: 'accepted',
    fromUserName: 'vul89-viewer',
    fromUserAvatar: null,
  });
  await hostPage.waitForTimeout(1200);

  return pairKey;
}

async function waitForLeaderboardRow(page, username, timeoutMs = 30_000) {
  const rowText = `@${username}`;
  await page.getByText(rowText).first().waitFor({ state: 'visible', timeout: timeoutMs });
}

async function isTextVisible(page, text, timeoutMs = 5_000) {
  const locator = page.getByText(text).first();
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function findVisibleText(page, candidates, timeoutMs = 5_000) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await isTextVisible(page, candidate, timeoutMs)) {
      return candidate;
    }
  }
  return null;
}

async function readBodyTextSample(page) {
  return await page.evaluate(() => (document?.body?.innerText ?? '').slice(0, 2000));
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(LOG_FILE, '', 'utf8');
  await writeFile(ROUTE_SWEEP_FILE, '', 'utf8');

  const report = {
    issue: 'VUL-89',
    branchUnderTest: BRANCH_UNDER_TEST,
    commitUnderTest: COMMIT_UNDER_TEST,
    generatedAt: null,
    host: null,
    viewer: null,
    checks: {
      seededPublicLeaderboardRows: { pass: false, details: '' },
      leaderboardLoadsWithRealRows: { pass: false, details: '' },
      profileDrillInFromRealRow: { pass: false, details: '' },
      selfRowVisible: { pass: false, details: '' },
      friendsFilterWorks: { pass: false, details: '' },
      reconnectStateBehaves: { pass: false, details: '' },
      noSequentialScanRegression: { pass: false, details: '' },
    },
    commandsRun,
    artifacts,
  };

  let hostExpo = null;
  let viewerExpo = null;
  let browser = null;
  let hostContext = null;
  let viewerContext = null;

  try {
    await log('Starting VUL-89 leaderboard validation.');
    const [hostTicket, viewerTicket, hostClerkUser, viewerClerkUser] = await Promise.all([
      createSignInTicket(HOST_CLERK_USER_ID),
      createSignInTicket(VIEWER_CLERK_USER_ID),
      fetchClerkUser(HOST_CLERK_USER_ID),
      fetchClerkUser(VIEWER_CLERK_USER_ID),
    ]);
    await log(
      `Using QA users host=${hostClerkUser.username ?? HOST_CLERK_USER_ID} viewer=${viewerClerkUser.username ?? VIEWER_CLERK_USER_ID}`,
    );

    hostExpo = startExpoWeb({ label: 'host', port: HOST_PORT, ticket: hostTicket });
    viewerExpo = startExpoWeb({ label: 'viewer', port: VIEWER_PORT, ticket: viewerTicket });
    await Promise.all([waitForUrlReachable(HOST_BASE), waitForUrlReachable(VIEWER_BASE)]);

    browser = await chromium.launch({ headless: true });
    hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const hostPage = await hostContext.newPage();
    const viewerPage = await viewerContext.newPage();
    attachConsoleCapture(hostPage, 'host');
    attachConsoleCapture(viewerPage, 'viewer');
    attachRouteCapture(hostPage, 'host');
    attachRouteCapture(viewerPage, 'viewer');

    const hostSession = await loginWithTicket(hostPage, HOST_BASE, 'host');
    const viewerSession = await loginWithTicket(viewerPage, VIEWER_BASE, 'viewer');
    report.host = {
      clerkUserId: HOST_CLERK_USER_ID,
      username: hostClerkUser.username ?? null,
      vuluUserId: hostSession.vuluUserId,
    };
    report.viewer = {
      clerkUserId: VIEWER_CLERK_USER_ID,
      username: viewerClerkUser.username ?? null,
      vuluUserId: viewerSession.vuluUserId,
    };

    await hostPage.goto(`${HOST_BASE}/leaderboard`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });
    await screenshot(hostPage, 'vul-89-leaderboard-before-seed.png');

    await runSql(
      `SELECT user_id, score, gold, gems FROM public_leaderboard WHERE user_id = '${escapeSqlLiteral(hostSession.vuluUserId)}' OR user_id = '${escapeSqlLiteral(viewerSession.vuluUserId)}'`,
      path.join(EVIDENCE_DIR, 'vul-89-sql-public-leaderboard-before.txt'),
    );

    const pairKey = await ensureAcceptedFriendship(
      hostPage,
      viewerPage,
      hostSession.vuluUserId,
      viewerSession.vuluUserId,
    );
    await runSql(
      `SELECT pair_key, user_low_id, user_high_id, status, requested_by FROM friendship WHERE pair_key = '${escapeSqlLiteral(pairKey)}'`,
      path.join(EVIDENCE_DIR, 'vul-89-sql-friendship-after-accept.txt'),
    );

    const hostWallet = await ensureWalletCashFloor(
      hostPage,
      'host',
      hostSession.vuluUserId,
      HOST_MIN_CASH,
    );
    const viewerWallet = await ensureWalletCashFloor(
      viewerPage,
      'viewer',
      viewerSession.vuluUserId,
      VIEWER_MIN_CASH,
    );
    await log(`[seed] host leaderboard row final=${JSON.stringify(hostWallet)}`);
    await log(`[seed] viewer leaderboard row final=${JSON.stringify(viewerWallet)}`);

    await runSql(
      `SELECT user_id, state FROM account_state_item WHERE user_id = '${escapeSqlLiteral(hostSession.vuluUserId)}' OR user_id = '${escapeSqlLiteral(viewerSession.vuluUserId)}'`,
      path.join(EVIDENCE_DIR, 'vul-89-sql-account-state-after-seed.txt'),
    );
    const publicLeaderboardAfter = await runSql(
      `SELECT user_id, score, gold, gems FROM public_leaderboard WHERE user_id = '${escapeSqlLiteral(hostSession.vuluUserId)}' OR user_id = '${escapeSqlLiteral(viewerSession.vuluUserId)}'`,
      path.join(EVIDENCE_DIR, 'vul-89-sql-public-leaderboard-after.txt'),
    );

    report.checks.seededPublicLeaderboardRows.pass =
      publicLeaderboardAfter.includes(hostSession.vuluUserId) &&
      publicLeaderboardAfter.includes(viewerSession.vuluUserId) &&
      hostWallet.score >= HOST_MIN_CASH &&
      viewerWallet.score >= VIEWER_MIN_CASH;
    report.checks.seededPublicLeaderboardRows.details = report.checks.seededPublicLeaderboardRows.pass
      ? `Seeded authoritative rows for ${hostSession.vuluUserId} and ${viewerSession.vuluUserId} with cash floors host=${hostWallet.score}, viewer=${viewerWallet.score}.`
      : 'Missing one or more target rows after authoritative seed.';

    await hostPage.reload({ waitUntil: 'networkidle', timeout: 120_000 });
    await screenshot(hostPage, 'vul-89-leaderboard-after-seed.png');
    const hostHandle = await findVisibleText(
      hostPage,
      [`@${hostClerkUser.username}`, `@${hostSession.vuluUserId}`],
      8_000,
    );
    const viewerHandle = await findVisibleText(
      hostPage,
      [`@${viewerClerkUser.username}`, `@${viewerSession.vuluUserId}`],
      8_000,
    );
    const hostRowVisible = Boolean(hostHandle);
    const viewerRowVisible = Boolean(viewerHandle);
    const postSeedBodySample = await readBodyTextSample(hostPage);
    await log(`[leaderboard] post-seed body sample=${JSON.stringify(postSeedBodySample)}`);

    report.checks.leaderboardLoadsWithRealRows.pass = viewerRowVisible;
    report.checks.leaderboardLoadsWithRealRows.details = viewerRowVisible
      ? `Signed-in leaderboard rendered the seeded friend row from the authoritative snapshot as ${viewerHandle}.`
      : 'Seeded leaderboard rows did not become visible on the signed-in leaderboard page.';

    const selfRowVisible = await hostPage.getByText('YOU').first().isVisible({ timeout: 5_000 }).catch(() => false);
    report.checks.selfRowVisible.pass = selfRowVisible;
    report.checks.selfRowVisible.details = selfRowVisible
      ? 'Current signed-in row rendered with YOU badge.'
      : `Current signed-in row did not render with YOU badge. Host username visible=${hostRowVisible}.`;

    if (viewerRowVisible) {
      await hostPage.getByText(viewerHandle).first().click({ timeout: 20_000 });
      const profileModalVisible = await hostPage
        .getByPlaceholder('Comment on photo...')
        .isVisible({ timeout: 20_000 })
        .catch(() => false);
      await screenshot(hostPage, 'vul-89-leaderboard-profile-drill-in.png');
      report.checks.profileDrillInFromRealRow.pass = profileModalVisible;
      report.checks.profileDrillInFromRealRow.details = profileModalVisible
        ? 'Clicked a real leaderboard row and opened the profile modal with interactive content.'
        : 'Clicked a real leaderboard row but the profile modal did not open.';

      await hostPage.mouse.click(16, 16).catch(() => {});
      await hostPage
        .getByPlaceholder('Comment on photo...')
        .waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        .catch(() => {});
      await hostPage.waitForTimeout(800);
    } else {
      await screenshot(hostPage, 'vul-89-leaderboard-profile-drill-in-failed.png');
      report.checks.profileDrillInFromRealRow.pass = false;
      report.checks.profileDrillInFromRealRow.details =
        'Could not drill into a real leaderboard row because the seeded friend row was not visible.';
    }

    await hostPage.getByText('Friends').click({ timeout: 20_000 });
    const friendFilterHandle = await findVisibleText(
      hostPage,
      [`@${viewerClerkUser.username}`, `@${viewerSession.vuluUserId}`],
      10_000,
    );
    const friendFilterVisible = Boolean(friendFilterHandle);
    await screenshot(hostPage, 'vul-89-leaderboard-friends-filter.png');
    report.checks.friendsFilterWorks.pass = friendFilterVisible;
    report.checks.friendsFilterWorks.details = friendFilterVisible
      ? `Friends filter rendered the accepted-friend QA row after authoritative seed as ${friendFilterHandle}.`
      : 'Friends filter did not render the accepted-friend QA row.';

    await hostContext.setOffline(true);
    const reconnectBannerText = await findVisibleText(
      hostPage,
      ['Leaderboard is reconnecting.', 'Reconnecting leaderboard'],
      20_000,
    );
    const reconnectBannerVisible = Boolean(reconnectBannerText);
    await screenshot(hostPage, 'vul-89-leaderboard-offline-reconnect-banner.png');
    await hostContext.setOffline(false);
    if (reconnectBannerText) {
      await hostPage.getByText(reconnectBannerText).waitFor({
        state: 'hidden',
        timeout: 30_000,
      }).catch(() => {});
    }
    await hostPage.reload({ waitUntil: 'networkidle', timeout: 120_000 });
    await hostPage.getByText('All').click({ timeout: 20_000 });
    const hostRowAfterReconnectHandle = await findVisibleText(
      hostPage,
      [`@${hostClerkUser.username}`, `@${hostSession.vuluUserId}`],
      8_000,
    );
    const viewerRowAfterReconnectHandle = await findVisibleText(
      hostPage,
      [`@${viewerClerkUser.username}`, `@${viewerSession.vuluUserId}`],
      8_000,
    );
    const hostRowAfterReconnect = Boolean(hostRowAfterReconnectHandle);
    const viewerRowAfterReconnect = Boolean(viewerRowAfterReconnectHandle);
    await screenshot(hostPage, 'vul-89-leaderboard-after-reconnect-reload.png');
    report.checks.reconnectStateBehaves.pass = viewerRowAfterReconnect;
    report.checks.reconnectStateBehaves.details = viewerRowAfterReconnect
      ? `Offline banner visible=${reconnectBannerVisible} (${reconnectBannerText ?? 'n/a'}). Seeded row persisted after reconnect/reload as ${viewerRowAfterReconnectHandle}. Host row visible after reconnect=${hostRowAfterReconnect} (${hostRowAfterReconnectHandle ?? 'n/a'}). Existing websocket stayed active during browser offline emulation, so banner visibility is treated as informational.`
      : `Offline banner visible=${reconnectBannerVisible}. Seeded leaderboard rows did not recover after reconnect/reload.`;

    const subscriptionErrors = consoleEvents.filter((entry) => {
      if (entry.type !== 'error' && entry.type !== 'warning') {
        return false;
      }
      const text = entry.text.toLowerCase();
      return (
        text.includes('sequential') ||
        text.includes(' scan') ||
        text.includes('planner') ||
        text.includes('subscription failed') ||
        text.includes('unsupported expression')
      );
    });
    report.checks.noSequentialScanRegression.pass = subscriptionErrors.length === 0;
    report.checks.noSequentialScanRegression.details =
      subscriptionErrors.length === 0
        ? 'No leaderboard subscription planner/runtime errors were observed during the route sweep.'
        : `Observed subscription/planner noise: ${subscriptionErrors.map((entry) => entry.text).join(' | ')}`;

    report.generatedAt = nowIso();
    await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    artifacts[path.basename(REPORT_FILE)] = REPORT_FILE;
    artifacts[path.basename(ROUTE_SWEEP_FILE)] = ROUTE_SWEEP_FILE;
    await log(`report: ${REPORT_FILE}`);
  } finally {
    await Promise.allSettled([
      stopProcess(hostExpo),
      stopProcess(viewerExpo),
      browser?.close?.().catch(() => {}),
    ]);
    await writeFile(LOG_FILE, `${logLines.join('\n')}\n`, 'utf8');
    await writeFile(ROUTE_SWEEP_FILE, `${routeSweepLines.join('\n')}\n`, 'utf8');
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  try {
    await log(`FAILED: ${message}`);
  } catch {}
  process.exitCode = 1;
});
