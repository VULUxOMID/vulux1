#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const DEFAULT_SMOKE_PORT = '19081';

function fail(message) {
  throw new Error(message);
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required env: ${name}`);
  return value;
}

function pickBaseUrl() {
  const explicit = process.env.QA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `http://127.0.0.1:${DEFAULT_SMOKE_PORT}`;
}

async function waitForUrl(baseUrl, timeoutMs, logger) {
  const deadline = Date.now() + timeoutMs;
  const target = `${baseUrl}/`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) {
        logger(`Web app reachable at ${target}`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Timed out waiting for ${target}`);
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

async function main() {
  const logger = (message) => console.log(`[smoke:web:auth] ${message}`);
  readRequiredEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  readRequiredEnv('EXPO_PUBLIC_RAILWAY_API_BASE_URL');
  readRequiredEnv('EXPO_PUBLIC_RAILWAY_WS_BASE_URL');

  const baseUrl = pickBaseUrl();
  let server = null;

  if (!process.env.QA_BASE_URL?.trim()) {
    const port = new URL(baseUrl).port || DEFAULT_SMOKE_PORT;
    logger(`starting Expo web on port ${port}`);
    server = spawn(
      'npx',
      ['expo', 'start', '--web', '--port', port],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout.on('data', (chunk) => logger(chunk.toString().trim()));
    server.stderr.on('data', (chunk) => logger(chunk.toString().trim()));
    await waitForUrl(baseUrl, 120_000, logger);
  }

  const playwright = await import('@playwright/test');
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.getByText('Welcome back', { exact: false }).waitFor({ timeout: 30_000 });
    await page.getByPlaceholder('you@example.com').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10_000 });
    logger('Clerk login screen rendered successfully.');
  } finally {
    await browser.close();
    await stopProcess(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
