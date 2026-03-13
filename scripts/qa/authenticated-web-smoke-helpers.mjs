import process from 'node:process';

export const DEFAULT_SIGN_IN_CODE = '424242';
export const DEFAULT_EVIDENCE_DIR = 'docs/qa';
export const AFTER_LOG_FILE = 'vul-72-smoke-after.log';
export const DEFAULT_SMOKE_PORT = '19081';

export function fail(message) {
  throw new Error(message);
}

export function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes('placeholder') ||
    normalized.includes('your_') ||
    normalized.includes('<') ||
    normalized.includes('example')
  );
}

export function readRequiredEnv(env, name, { allowPlaceholder = false } = {}) {
  const value = env[name]?.trim();
  if (!value) {
    fail(`Missing required env: ${name}`);
  }
  if (!allowPlaceholder && isPlaceholderValue(value)) {
    fail(`Invalid ${name}: placeholder value is not allowed for authenticated smoke.`);
  }
  return value;
}

export function pickBaseUrl(env = process.env) {
  const explicit = env.QA_BASE_URL?.trim();
  if (explicit) {
    const normalized = explicit.replace(/\/$/, '');
    if (!/^https?:\/\//.test(normalized)) {
      fail(`Invalid QA_BASE_URL: expected an absolute URL, received "${explicit}".`);
    }
    try {
      return new URL(normalized).toString().replace(/\/$/, '');
    } catch {
      fail(`Invalid QA_BASE_URL: expected an absolute URL, received "${explicit}".`);
    }
  }
  return `http://127.0.0.1:${DEFAULT_SMOKE_PORT}`;
}

export async function ensurePlaywrightChromiumReady() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail(
      'Missing Playwright runtime. Install workspace dependencies with `npm install` before running authenticated smoke.',
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    return chromium;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Executable doesn't exist") ||
      message.includes('Please run the following command') ||
      message.includes('playwright install')
    ) {
      fail('Playwright Chromium is not installed. Run `npx playwright install chromium`.');
    }
    throw error;
  } finally {
    await browser?.close().catch(() => {});
  }
}
