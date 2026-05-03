import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';

const INDEX = '/Users/omid/vulux1/tools/codex-chat-operator/index.mjs';
let src = readFileSync(INDEX, 'utf8');

// 1. Add verifyShipped function
const VERIFY_FN = `
import { spawnSync as _spawnSyncVerify } from "node:child_process";
function verifyShipped(branch, repoRoot) {
  const root = repoRoot || "/Users/omid/vulux1";
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  const pr = _spawnSyncVerify("gh", ["pr", "list", "--head", branch, "--json", "url", "--limit", "1"], { cwd: root, encoding: "utf8" });
  try { const prs = JSON.parse(pr.stdout || "[]"); if (prs.length > 0) return { verified: true, reason: "PR: " + prs[0].url }; } catch(_e) {}
  return { verified: false, reason: "no remote branch and no PR for: " + branch };
}
`;

if (!src.includes('function verifyShipped')) {
  // Insert before first export or function
  src = VERIFY_FN + src;
  console.log('Added verifyShipped()');
} else {
  console.log('verifyShipped() already present');
}

// 2. Replace idle->done with verified check
const OLD_BLOCK = `  if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {
    updateRun(state, activeRun.runId, {
      status: "done",
      error: null,
      chatUrl: inspected.href || activeRun.chatUrl,
    });
    return {
      runId: activeRun.runId,
      status: "done",
      inspected,
      idlePolls,
    };
  }`;

const NEW_BLOCK = `  if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {
    const branch = activeRun.branch || "";
    const bodyText = inspected.bodySample || "";
    if (/NO-SHIP:/i.test(bodyText)) {
      updateRun(state, activeRun.runId, { status: "done", error: "NO-SHIP declared by Codex.", chatUrl: inspected.href || activeRun.chatUrl });
      return { runId: activeRun.runId, status: "done", reason: "NO-SHIP", inspected, idlePolls };
    }
    if (branch) {
      const ship = verifyShipped(branch);
      if (ship.verified) {
        updateRun(state, activeRun.runId, { status: "done", error: null, chatUrl: inspected.href || activeRun.chatUrl });
        return { runId: activeRun.runId, status: "done", reason: ship.reason, inspected, idlePolls };
      }
      // Idle but nothing verifiable yet — keep as running, do not mark done
      updateRun(state, activeRun.runId, {
        probe: { status: "idle-unverified", idlePolls, checkedAt: new Date().toISOString(), verifyReason: ship.reason, bodySample: inspected.bodySample, activeMarkers: inspected.activeMarkers },
      });
      return { runId: activeRun.runId, status: "idle-unverified", reason: ship.reason, inspected, idlePolls };
    }
  }`;

if (src.includes(OLD_BLOCK)) {
  src = src.replace(OLD_BLOCK, NEW_BLOCK);
  console.log('Patched: idle->done now requires verified ship or NO-SHIP');
} else {
  console.log('WARNING: old block not found verbatim');
}

// 3. Raise stale default 60->90
const before = src;
src = src.replace(
  "flags['recover-stale-minutes']) : 60;",
  "flags['recover-stale-minutes']) : 90;"
);
console.log(src !== before ? 'Stale raised to 90 min' : 'WARNING: stale pattern not found');

writeFileSync(INDEX, src);
console.log('index.mjs saved.');
