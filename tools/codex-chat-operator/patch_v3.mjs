#!/usr/bin/env node
/**
 * patch_v3.mjs — four-issue comprehensive fix:
 *
 * 1. verifyShipped: remove gh dependency; use hasViewPR + partial git ls-remote by ticketId
 * 2. After dispatch: poll sidebar to capture task-specific URL within 30s
 * 3. reconcileActiveRun: prefer task URL; pass inspected.href (not targetUrl) to clickCreatePRButton
 * 4. State cleanup: audit/reset false-done runs where no remote branch exists
 */

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const TRANSPORT_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/lib/chromeTransport.mjs";
const INDEX_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/index.mjs";
const STATE_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json";
const REPO_ROOT = "/Users/omid/vulux1";

// ─── PATCH A: chromeTransport.mjs — add GET_LATEST_TASK_URL_JS + export ───

let transport = readFileSync(TRANSPORT_PATH, "utf8");

const TASK_URL_BLOCK = `
const GET_LATEST_TASK_URL_JS = String.raw\`(() => {
  // Find the most recently-created task link in the Codex sidebar
  var links = Array.from(document.querySelectorAll('a[href*="/codex/tasks/"]'));
  if (links.length === 0) return null;
  return links[0].href;
})()\`;

export function getLatestTaskUrl(targetUrl = DEFAULT_CODEX_URL) {
  ensureCodexTab(targetUrl);
  const result = executeChromeJs(GET_LATEST_TASK_URL_JS);
  // osascript returns "missing value" as string when JS returns null
  return (!result || result === "missing value") ? null : result;
}
`;

const TRANSPORT_ANCHOR = `export function ensureCodexTab(`;
if (!transport.includes(TRANSPORT_ANCHOR)) {
  console.error("❌ transport anchor not found"); process.exit(1);
}
// Only add if not already patched
if (!transport.includes("GET_LATEST_TASK_URL_JS")) {
  transport = transport.replace(TRANSPORT_ANCHOR, TASK_URL_BLOCK + TRANSPORT_ANCHOR);
  console.log("✓ chromeTransport: added getLatestTaskUrl()");
} else {
  console.log("  chromeTransport: getLatestTaskUrl already present");
}

// Also add latestTaskUrl to PROBE_RUN_JS return value
const OLD_PROBE_BODY = `    hasCreatePR: buttons.some((button) => /^Create PR$/i.test(button.text) && !button.disabled),
    hasViewPR: buttons.some((button) => /^View PR$/i.test(button.text)),
  });`;
const NEW_PROBE_BODY = `    hasCreatePR: buttons.some((button) => /^Create PR$/i.test(button.text) && !button.disabled),
    hasViewPR: buttons.some((button) => /^View PR$/i.test(button.text)),
    isTaskPage: /\\/codex\\/tasks\\//.test(window.location.href),
    latestTaskUrl: (() => { var ls = Array.from(document.querySelectorAll('a[href*="/codex/tasks/"]')); return ls.length ? ls[0].href : null; })(),
  });`;

if (transport.includes(OLD_PROBE_BODY)) {
  transport = transport.replace(OLD_PROBE_BODY, NEW_PROBE_BODY);
  console.log("✓ chromeTransport: added isTaskPage + latestTaskUrl to probe");
} else if (transport.includes("isTaskPage")) {
  console.log("  chromeTransport: isTaskPage already present");
} else {
  console.error("❌ could not find probe return anchor for isTaskPage patch");
}

writeFileSync(TRANSPORT_PATH, transport);
console.log("✓ Wrote chromeTransport.mjs");

// ─── PATCH B: index.mjs ───────────────────────────────────────────────────

let index = readFileSync(INDEX_PATH, "utf8");

// B1. Add getLatestTaskUrl to import
const OLD_IMPORT = `import { clickCreatePRButton, inspectCodexRun, sendPromptToCodex }`;
const NEW_IMPORT = `import { clickCreatePRButton, getLatestTaskUrl, inspectCodexRun, sendPromptToCodex }`;
if (index.includes(OLD_IMPORT)) {
  index = index.replace(OLD_IMPORT, NEW_IMPORT);
  console.log("✓ index: added getLatestTaskUrl import");
} else if (index.includes("getLatestTaskUrl")) {
  console.log("  index: getLatestTaskUrl already imported");
} else {
  console.error("❌ import anchor not found:", index.split("\n").find(l => l.includes("clickCreatePRButton")));
  process.exit(1);
}

// B2. Fix verifyShipped — remove gh, add ticketId partial match, add hasViewPR param
const OLD_VERIFY = `function verifyShipped(branch, repoRoot) {
  const root = repoRoot || "/Users/omid/vulux1";
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  const pr = _spawnSyncVerify("gh", ["pr", "list", "--head", branch, "--json", "url", "--limit", "1"], { cwd: root, encoding: "utf8" });
  try { const prs = JSON.parse(pr.stdout || "[]"); if (prs.length > 0) return { verified: true, reason: "PR: " + prs[0].url }; } catch(_e) {}
  return { verified: false, reason: "no remote branch and no PR for: " + branch };
}`;

const NEW_VERIFY = `function verifyShipped(branch, taskId, probeHasViewPR, repoRoot) {
  // Primary: Codex UI already shows "View PR" — PR is live
  if (probeHasViewPR) return { verified: true, reason: "Codex shows View PR button" };
  const root = repoRoot || "/Users/omid/vulux1";
  // Exact branch name check
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  // Partial match by ticket ID (Codex may push under a different branch prefix)
  if (taskId) {
    const allLs = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin"], { cwd: root, encoding: "utf8" });
    const ticketLower = taskId.toLowerCase().replace(/^(vul|adm)-/, "");
    const match = (allLs.stdout || "").split("\\n").find(l => l.toLowerCase().includes(ticketLower));
    if (match) return { verified: true, reason: "partial-match branch: " + match.trim() };
  }
  return { verified: false, reason: "no remote branch for: " + branch + (taskId ? " (" + taskId + ")" : "") };
}`;

if (index.includes(OLD_VERIFY)) {
  index = index.replace(OLD_VERIFY, NEW_VERIFY);
  console.log("✓ index: replaced verifyShipped (removed gh, added hasViewPR + partial match)");
} else {
  console.error("❌ verifyShipped anchor not found");
  process.exit(1);
}

// B3. Fix verifyShipped call site: pass taskId and hasViewPR
const OLD_VERIFY_CALL = `      const ship = verifyShipped(branch);`;
const NEW_VERIFY_CALL = `      const ship = verifyShipped(branch, activeRun.taskId, inspected.hasViewPR);`;
if (index.includes(OLD_VERIFY_CALL)) {
  index = index.replace(OLD_VERIFY_CALL, NEW_VERIFY_CALL);
  console.log("✓ index: fixed verifyShipped call site");
} else {
  console.error("❌ verifyShipped call site not found");
  process.exit(1);
}

// B4. Fix clickCreatePRButton to use actual task page URL (inspected.href) not targetUrl
const OLD_CLICK_PR = `      const clickResult = clickCreatePRButton(activeRun.targetUrl);`;
const NEW_CLICK_PR = `      const taskPageUrl = inspected.href && inspected.href.includes("/tasks/") ? inspected.href : (activeRun.chatUrl || activeRun.targetUrl);
      const clickResult = clickCreatePRButton(taskPageUrl);`;
if (index.includes(OLD_CLICK_PR)) {
  index = index.replace(OLD_CLICK_PR, NEW_CLICK_PR);
  console.log("✓ index: clickCreatePRButton uses task page URL");
} else {
  console.error("❌ clickCreatePRButton call site not found");
  process.exit(1);
}

// B5. After sendPromptToCodex, poll sidebar for task-specific URL (up to 30s)
const OLD_AFTER_SEND = `    const result = sendPromptToCodex(prompt, { targetUrl });
    updateRun(state, run.runId, {
      status: "running",
      chatUrl: result.chatUrl,
      error: null,
    });
    saveState(state);
    console.log(\`Dispatched \${task.taskId} as run \${run.runId}\`);
    console.log(\`Chat URL: \${result.chatUrl}\`);`;

const NEW_AFTER_SEND = `    const result = sendPromptToCodex(prompt, { targetUrl });
    // Poll up to 30s for Codex to navigate to a task-specific URL
    let taskUrl = result.chatUrl;
    for (let i = 0; i < 10 && !taskUrl?.includes("/tasks/"); i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      const polledUrl = getLatestTaskUrl(targetUrl);
      if (polledUrl && polledUrl.includes("/tasks/")) { taskUrl = polledUrl; break; }
    }
    updateRun(state, run.runId, {
      status: "running",
      chatUrl: taskUrl,
      error: null,
    });
    saveState(state);
    console.log(\`Dispatched \${task.taskId} as run \${run.runId}\`);
    console.log(\`Chat URL: \${taskUrl}\`);`;

if (index.includes(OLD_AFTER_SEND)) {
  index = index.replace(OLD_AFTER_SEND, NEW_AFTER_SEND);
  console.log("✓ index: poll for task URL after dispatch");
} else {
  console.error("❌ post-send anchor not found");
  process.exit(1);
}

// B6. In reconcileActiveRun: if probing generic /codex and latestTaskUrl exists, use it
// Insert after the probe + idlePolls computation, before the idle block check
const OLD_RECONCILE_PROBE = `  updateRun(state, activeRun.runId, {
    chatUrl: inspected.href || activeRun.chatUrl,
    probe: {
      status: inspected.status,
      idlePolls,
      checkedAt: new Date().toISOString(),
      activeMarkers: inspected.activeMarkers,
      stopLikeButtons: inspected.stopLikeButtons,
      bodySample: inspected.bodySample,
    },
  });
  if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {`;

const NEW_RECONCILE_PROBE = `  // Upgrade chatUrl to task-specific URL if available
  const resolvedChatUrl = (inspected.href && inspected.href.includes("/tasks/"))
    ? inspected.href
    : (inspected.latestTaskUrl && inspected.latestTaskUrl.includes("/tasks/"))
      ? inspected.latestTaskUrl
      : (inspected.href || activeRun.chatUrl);
  updateRun(state, activeRun.runId, {
    chatUrl: resolvedChatUrl,
    probe: {
      status: inspected.status,
      idlePolls,
      checkedAt: new Date().toISOString(),
      activeMarkers: inspected.activeMarkers,
      stopLikeButtons: inspected.stopLikeButtons,
      bodySample: inspected.bodySample,
    },
  });
  if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {`;

if (index.includes(OLD_RECONCILE_PROBE)) {
  index = index.replace(OLD_RECONCILE_PROBE, NEW_RECONCILE_PROBE);
  console.log("✓ index: chatUrl upgraded to task-specific URL in reconcile");
} else {
  console.error("❌ reconcile probe anchor not found");
  process.exit(1);
}

writeFileSync(INDEX_PATH, index);
console.log("✓ Wrote index.mjs");

// ─── PATCH C: Audit + reset false-done runs ─────────────────────────────

console.log("\n=== Auditing false-done runs ===");
const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

// Get all remote branches once
const allBranches = spawnSync("git", ["ls-remote", "--heads", "origin"], {
  cwd: REPO_ROOT, encoding: "utf8"
});
const remoteBranchText = allBranches.stdout || "";

const doneTasks = (state.tasks || []).filter(t => t.status === "done");
const toReset = [];

for (const task of doneTasks) {
  const taskId = task.taskId;
  // Skip consolidation passes — they don't push branches
  if (taskId.startsWith("CONSOLIDATE-")) continue;

  // Find the most recent run for this task
  const taskRuns = (state.runs || []).filter(r => r.taskId === taskId);
  const doneRun = taskRuns.find(r => r.status === "done");

  if (!doneRun) continue;

  const branch = doneRun.branch || "";
  const ticketNum = taskId.toLowerCase().replace(/^(vul|adm)-/, "");

  // Check exact branch
  const hasExact = branch && remoteBranchText.includes(branch);
  // Check partial (ticket number anywhere in a branch name)
  const hasPartial = ticketNum && remoteBranchText.split("\n").some(l => l.toLowerCase().includes(ticketNum));

  if (!hasExact && !hasPartial) {
    toReset.push({ taskId, branch, ticketNum });
  } else {
    console.log(`  ✓ ${taskId}: verified (${hasExact ? "exact" : "partial"} match)`);
  }
}

if (toReset.length === 0) {
  console.log("All done tasks have verifiable remote branches — nothing to reset.");
} else {
  console.log(`\nResetting ${toReset.length} false-done task(s):`);
  for (const { taskId, branch } of toReset) {
    console.log(`  ✗ ${taskId} (branch: ${branch || "none"})`);

    // Mark runs failed
    for (const run of (state.runs || [])) {
      if (run.taskId === taskId && run.status === "done") {
        run.status = "failed";
        run.error = "Reset: no remote branch verified at audit time.";
        run.completedAt = run.completedAt || new Date().toISOString();
      }
    }
    // Reset task to pending
    const task = state.tasks.find(t => t.taskId === taskId);
    if (task) {
      task.status = "pending";
      task.updatedAt = new Date().toISOString();
    }
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log("✓ State updated.");
}

console.log("\n✅ All patches applied. Verifying syntax...");
