#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const INDEX_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/index.mjs";
let index = readFileSync(INDEX_PATH, "utf8");

// 1. Fix the import line
const OLD_IMPORT = `import { inspectCodexRun, sendPromptToCodex }`;
const NEW_IMPORT = `import { clickCreatePRButton, inspectCodexRun, sendPromptToCodex }`;
if (!index.includes(OLD_IMPORT)) {
  console.error("❌ import anchor not found. Line:", index.split("\n").find(l => l.includes("inspectCodexRun")));
  process.exit(1);
}
index = index.replace(OLD_IMPORT, NEW_IMPORT);
console.log("✓ Added clickCreatePRButton to import");

// 2. Insert Create PR auto-click BEFORE the NO-SHIP check inside the idle block
const OLD_NO_SHIP = `    if (/NO-SHIP:/i.test(bodyText)) {`;
const NEW_NO_SHIP = `    // If Codex finished but hasn't pushed yet — auto-click "Create PR"
    if (inspected.hasCreatePR) {
      const clickResult = clickCreatePRButton(activeRun.targetUrl);
      updateRun(state, activeRun.runId, {
        probe: { status: "creating-pr", clickResult, checkedAt: new Date().toISOString() },
      });
      return { runId: activeRun.runId, status: "creating-pr", reason: clickResult, inspected, idlePolls };
    }

    if (/NO-SHIP:/i.test(bodyText)) {`;

if (!index.includes(OLD_NO_SHIP)) {
  console.error("❌ NO-SHIP anchor not found in idle block");
  process.exit(1);
}
index = index.replace(OLD_NO_SHIP, NEW_NO_SHIP);
console.log("✓ Added Create PR auto-click before NO-SHIP check");

writeFileSync(INDEX_PATH, index);
console.log("\n✅ index.mjs patched. Verifying syntax...");
