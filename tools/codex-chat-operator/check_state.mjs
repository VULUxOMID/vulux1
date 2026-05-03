#!/usr/bin/env node
import { readFileSync } from "node:fs";
const statePath = "/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json";
let state;
try {
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch (e) {
  console.log("State file error:", e.message);
  process.exit(1);
}

const activeStatuses = new Set(["running", "dispatched", "idle-unverified"]);
const activeRuns = state.runs?.filter(r => activeStatuses.has(r.status)) || [];
const pendingTasks = state.tasks?.filter(t => t.status === "pending") || [];

console.log("=== ACTIVE RUNS ===");
for (const r of activeRuns) {
  console.log(JSON.stringify(r, null, 2));
}

console.log("\n=== PENDING TASKS (next 5) ===");
for (const t of pendingTasks.slice(0, 5)) {
  console.log(`${t.taskId} | ${t.title}`);
}
