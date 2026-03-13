#!/usr/bin/env node

import process from 'node:process';
import {
  ensurePlaywrightChromiumReady,
  pickBaseUrl,
  readRequiredEnv,
} from './authenticated-web-smoke-helpers.mjs';

async function main() {
  const baseUrl = pickBaseUrl(process.env);
  readRequiredEnv(process.env, 'CLERK_SECRET_KEY');
  readRequiredEnv(process.env, 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  await ensurePlaywrightChromiumReady();

  console.log('Authenticated web smoke preflight passed.');
  console.log(`Base URL: ${baseUrl}`);
  console.log('Next step: npm run smoke:web:auth');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:web:auth:check] ${message}`);
  process.exit(1);
});
