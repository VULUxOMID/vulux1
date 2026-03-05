#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const API_BASE = 'https://api.clerk.com/v1';
const BASE_URL = process.env.VUL71_BASE_URL ?? 'http://127.0.0.1:19082';
const routes = ['/', '/go-live', '/live', '/play'];
const reportFile =
  process.env.VUL71_REPORT_FILE ?? '/Users/omid/vulux1-vul71/docs/qa/vul-71-console-scan-after.json';

function reqEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function clerk(path, init, sk) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${sk}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const txt = await res.text();
  const payload = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(`Clerk ${res.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function provision(sk) {
  const stamp = Date.now();
  const suffix = randomUUID().slice(0, 8);
  const email = `authqa+${stamp}.${suffix}@example.com`;
  const username = `authqa_${stamp}_${suffix}`;
  const password = `AuthQa!${stamp}${suffix}`;
  const phone = `+1415555${Math.floor(1000 + Math.random() * 9000).toString()}`;
  const user = await clerk(
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
    sk,
  );
  const token = await clerk(
    '/sign_in_tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        expires_in_seconds: 300,
      }),
    },
    sk,
  );
  return { email, password, ticket: token.token };
}

async function waitForServer(ms = 120000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
      if (r.status >= 200 && r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Server did not start');
}

async function stop(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function classify(msg) {
  const t = msg.toLowerCase();
  return {
    shadow: t.includes('shadow') && t.includes('deprecated'),
    textShadow: t.includes('textshadow') && t.includes('deprecated'),
    pointerEvents: t.includes('pointerevents') && t.includes('deprecated'),
    touchableWithoutFeedback:
      t.includes('touchablewithoutfeedback') && t.includes('deprecated'),
  };
}

async function run() {
  const sk = reqEnv('CLERK_SECRET_KEY');
  reqEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

  const qa = await provision(sk);
  const expo = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['expo', 'start', '--web', '--port', '19082'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: '1',
        EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET: qa.ticket,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  expo.stdout.on('data', (d) => {
    const s = String(d).trim();
    if (s) console.log(`[expo] ${s}`);
  });
  expo.stderr.on('data', (d) => {
    const s = String(d).trim();
    if (s) console.log(`[expo:stderr] ${s}`);
  });

  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    let currentRoute = '/login';
    const all = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (!['warning', 'error'].includes(type)) return;
      const c = classify(text);
      if (!c.shadow && !c.textShadow && !c.pointerEvents && !c.touchableWithoutFeedback) return;
      const row = { route: currentRoute, type, text };
      all.push(row);
      console.log(`[console][${currentRoute}] ${type}: ${text}`);
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(1200);

    const emailInput = page.getByPlaceholder('Email or username');
    const passInput = page.getByPlaceholder('Password');
    const hasCredFields =
      (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) &&
      (await passInput.isVisible({ timeout: 1000 }).catch(() => false));
    if (hasCredFields) {
      await emailInput.fill(qa.email);
      await passInput.fill(qa.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    }

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const loginBtn = await page
        .getByRole('button', { name: 'Sign in' })
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (!loginBtn && !page.url().includes('/login')) break;
      const codeInput = page.getByPlaceholder('Sign-in verification code');
      const codeVisible = await codeInput.isVisible({ timeout: 300 }).catch(() => false);
      if (codeVisible) {
        await codeInput.fill('424242');
        await page.getByRole('button', { name: 'Verify sign-in code' }).click();
      }
      await page.waitForTimeout(800);
    }

    for (const route of routes) {
      currentRoute = route;
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1400);
      console.log(`[route] ${route} loaded`);
    }

    await browser.close();

    const counts = {
      shadow: all.filter((r) => classify(r.text).shadow).length,
      textShadow: all.filter((r) => classify(r.text).textShadow).length,
      pointerEvents: all.filter((r) => classify(r.text).pointerEvents).length,
      touchableWithoutFeedback: all.filter((r) => classify(r.text).touchableWithoutFeedback).length,
      total: all.length,
    };

    const report = {
      counts,
      matches: all,
      routes,
    };

    await writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`Wrote ${reportFile}`);
    console.log(`COUNTS ${JSON.stringify(counts)}`);
  } finally {
    await stop(expo);
  }
}

run().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});

