#!/usr/bin/env node

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readAuthSnippet(text) {
  const match = /auth u:[^\n]+/.exec(text);
  return match ? match[0] : 'auth snippet not found';
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail('Missing playwright dependency. Install with `npm install -D @playwright/test`.');
  }

  const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:8081').trim().replace(/\/$/, '');
  const username = process.env.QA_USERNAME?.trim();
  const password = process.env.QA_PASSWORD?.trim();
  const signInCode = process.env.QA_SIGNIN_CODE?.trim() || '424242';
  const evidenceDir = (process.env.QA_EVIDENCE_DIR ?? '/Users/omid/vulux1/docs/qa').trim();

  if (!username || !password) {
    fail('Missing QA_USERNAME or QA_PASSWORD.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('[1] Open /login and authenticate');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByPlaceholder('Email or username').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const signInCodeInput = page.getByPlaceholder('Sign-in verification code');
  const codePromptVisible = await signInCodeInput.isVisible({ timeout: 12000 }).catch(() => false);
  console.log(`[2] Second-factor prompt visible: ${codePromptVisible}`);

  if (codePromptVisible) {
    await page.screenshot({
      path: `${evidenceDir}/vul-70-after-fix-second-factor-prompt.png`,
      fullPage: true,
    });
    await signInCodeInput.fill(signInCode);
    await page.getByRole('button', { name: 'Verify sign-in code' }).click();
  }

  await page.waitForURL((url) => url.toString() === `${baseUrl}/`, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const homeText = await page.locator('body').innerText();
  console.log(`[3] Home auth debug: ${readAuthSnippet(homeText)}`);
  await page.screenshot({ path: `${evidenceDir}/vul-70-after-fix-home.png`, fullPage: true });

  console.log('[4] Navigate to /go-live');
  await page.goto(`${baseUrl}/go-live`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const goLiveText = await page.locator('body').innerText();
  console.log(`[5] /go-live auth debug: ${readAuthSnippet(goLiveText)}`);
  await page.screenshot({ path: `${evidenceDir}/vul-70-after-fix-go-live.png`, fullPage: true });

  console.log('[6] Navigate to /live');
  await page.goto(`${baseUrl}/live`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const liveText = await page.locator('body').innerText();
  console.log(`[7] /live auth debug: ${readAuthSnippet(liveText)}`);
  await page.screenshot({ path: `${evidenceDir}/vul-70-after-fix-live.png`, fullPage: true });

  const goToHome = page.getByRole('button', { name: 'Go To Home' });
  if (await goToHome.isVisible().catch(() => false)) {
    console.log('[8] Click Go To Home CTA');
    await goToHome.click();
    await page.waitForURL((url) => url.toString() === `${baseUrl}/`, { timeout: 30000 });
  } else {
    console.log('[8] Go To Home CTA not present; navigate to / directly');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 60000 });
  }

  await page.waitForTimeout(1200);
  const returnText = await page.locator('body').innerText();
  console.log(`[9] Home return auth debug: ${readAuthSnippet(returnText)}`);
  await page.screenshot({ path: `${evidenceDir}/vul-70-after-fix-home-return.png`, fullPage: true });

  await browser.close();
  console.log('[10] Smoke complete');
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
