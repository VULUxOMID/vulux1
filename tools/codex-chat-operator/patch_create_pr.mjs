#!/usr/bin/env node
/**
 * Patches chromeTransport.mjs to:
 *   1. Detect "Create PR" button in PROBE_RUN_JS
 *   2. Export clickCreatePRButton() function
 *
 * Patches index.mjs to:
 *   3. Call clickCreatePRButton() when page is idle and Create PR is available
 */

import { readFileSync, writeFileSync } from "node:fs";

const TRANSPORT_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/lib/chromeTransport.mjs";
const INDEX_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/index.mjs";

// ─── Patch 1: chromeTransport.mjs ─────────────────────────────────────────

let transport = readFileSync(TRANSPORT_PATH, "utf8");

// 1a. Add hasCreatePR and hasViewPR to PROBE_RUN_JS return value
const OLD_PROBE_RETURN = `    bodySample: bodyText.slice(0, 1200),\n  });`;
const NEW_PROBE_RETURN = `    bodySample: bodyText.slice(0, 1200),
    hasCreatePR: buttons.some((button) => /^Create PR$/i.test(button.text) && !button.disabled),
    hasViewPR: buttons.some((button) => /^View PR$/i.test(button.text)),
  });`;

if (!transport.includes(OLD_PROBE_RETURN)) {
  console.error("❌ Could not find PROBE_RUN_JS return anchor in chromeTransport.mjs");
  process.exit(1);
}
transport = transport.replace(OLD_PROBE_RETURN, NEW_PROBE_RETURN);

// 1b. Add CLICK_CREATE_PR_JS constant and clickCreatePRButton() export
const CLICK_PR_JS_BLOCK = `
const CLICK_CREATE_PR_JS = String.raw\`(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => /^Create PR$/i.test((b.innerText || '').trim()) && !b.disabled
  );
  if (!btn) return 'missing-create-pr';
  btn.click();
  return 'clicked-create-pr';
})()\`;

export function clickCreatePRButton(targetUrl = DEFAULT_CODEX_URL) {
  ensureCodexTab(targetUrl);
  return executeChromeJs(CLICK_CREATE_PR_JS);
}
`;

// Insert before the export of ensureCodexTab
const EXPORT_ANCHOR = `export function ensureCodexTab(`;
if (!transport.includes(EXPORT_ANCHOR)) {
  console.error("❌ Could not find ensureCodexTab anchor in chromeTransport.mjs");
  process.exit(1);
}
transport = transport.replace(EXPORT_ANCHOR, CLICK_PR_JS_BLOCK + EXPORT_ANCHOR);

writeFileSync(TRANSPORT_PATH, transport);
console.log("✓ Patched chromeTransport.mjs — added hasCreatePR/hasViewPR + clickCreatePRButton()");

// ─── Patch 2: index.mjs ──────────────────────────────────────────────────

let index = readFileSync(INDEX_PATH, "utf8");

// 2a. Import clickCreatePRButton
// The import line looks like: import { inspectCodexRun, sendPromptToCodex } from ...
const OLD_IMPORT = `import { inspectCodexRun, sendPromptToCodex }`;
const NEW_IMPORT = `import { clickCreatePRButton, inspectCodexRun, sendPromptToCodex }`;

if (!index.includes(OLD_IMPORT)) {
  console.error("❌ Could not find import anchor in index.mjs");
  console.error("  Looking for:", OLD_IMPORT);
  const line = index.split("\n").find(l => l.includes("inspectCodexRun"));
  console.error("  Found line:", line);
  process.exit(1);
}
index = index.replace(OLD_IMPORT, NEW_IMPORT);

// 2b. In the idle block, before checking verifyShipped, handle "Create PR" button
// Find the idle block where we check idlePolls
const OLD_IDLE_BLOCK = `if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {
      const branch = activeRun.branch || "";
      const bodyText = inspected.bodySample || "";
      if (/NO-SHIP:/i.test(bodyText)) {`;

const NEW_IDLE_BLOCK = `if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {
      const branch = activeRun.branch || "";
      const bodyText = inspected.bodySample || "";

      // If Codex finished the task but hasn't pushed yet, click "Create PR"
      if (inspected.hasCreatePR) {
        const clickResult = clickCreatePRButton(activeRun.targetUrl);
        updateRun(state, activeRun.runId, {
          probe: { status: "creating-pr", clickResult, checkedAt: new Date().toISOString() },
        });
        return { runId: activeRun.runId, status: "creating-pr", reason: clickResult, inspected, idlePolls };
      }

      if (/NO-SHIP:/i.test(bodyText)) {`;

if (!index.includes(OLD_IDLE_BLOCK)) {
  console.error("❌ Could not find idle block anchor in index.mjs");
  process.exit(1);
}
index = index.replace(OLD_IDLE_BLOCK, NEW_IDLE_BLOCK);

writeFileSync(INDEX_PATH, index);
console.log("✓ Patched index.mjs — auto-clicks Create PR when page is idle with unsubmitted work");
console.log("\nDone. Run: node tools/codex-chat-operator/index.mjs list");
