#!/usr/bin/env node
// Resets a stuck/failed run back to pending so dispatch-next will re-queue it.
import { readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json";
const TASK_ID = process.argv[2];

if (!TASK_ID) {
  console.error("Usage: reset_run.mjs <TASK_ID>");
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

// Mark the active run as failed
const ACTIVE = new Set(["running", "idle-unverified", "dispatched", "creating-pr"]);
const run = state.runs?.find(r => r.taskId === TASK_ID && ACTIVE.has(r.status));
if (run) {
  run.status = "failed";
  run.error = "Manually reset — prompt not submitted.";
  run.completedAt = new Date().toISOString();
  console.log(`✓ Run ${run.runId} marked failed`);
} else {
  console.log("No active run found for", TASK_ID);
}

// Reset task to pending
const task = state.tasks?.find(t => t.taskId === TASK_ID);
if (task) {
  task.status = "pending";
  task.updatedAt = new Date().toISOString();
  console.log(`✓ Task ${TASK_ID} reset to pending`);
}

writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
