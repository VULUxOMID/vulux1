#!/usr/bin/env node
// Marks a run as done and its task as done, given the actual branch Codex used.
import { readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = "/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json";
const TASK_ID = process.argv[2];  // e.g. VUL-156
const ACTUAL_BRANCH = process.argv[3]; // e.g. codex/fix-dm-mention/reply-notifications-bug
const PR_URL = process.argv[4] || null;

if (!TASK_ID || !ACTUAL_BRANCH) {
  console.error("Usage: mark_done.mjs <TASK_ID> <ACTUAL_BRANCH> [PR_URL]");
  process.exit(1);
}

const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

// Find the active run for this task
const run = state.runs?.find(r => r.taskId === TASK_ID && ["running", "idle-unverified", "dispatched"].includes(r.status));
if (!run) {
  console.error(`No active run found for task ${TASK_ID}`);
  process.exit(1);
}

// Update run
run.status = "done";
run.branch = ACTUAL_BRANCH;
run.error = null;
run.completedAt = new Date().toISOString();
if (PR_URL) run.chatUrl = PR_URL;

// Update task
const task = state.tasks?.find(t => t.taskId === TASK_ID);
if (task) {
  task.status = "done";
  task.updatedAt = new Date().toISOString();
}

writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
console.log(`✓ Marked ${TASK_ID} run ${run.runId} as done`);
console.log(`  branch: ${ACTUAL_BRANCH}`);
if (PR_URL) console.log(`  PR: ${PR_URL}`);
