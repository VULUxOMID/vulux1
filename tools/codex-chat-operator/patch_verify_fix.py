#!/usr/bin/env python3
"""
patch_verify_fix.py — two fixes:
 1. verifyShipped partial match: only search ref name (not SHA hash)
    and require full ticket string (e.g. "vul-158") not just "158"
 2. Reset VUL-158 (falsely completed) + CONSOLIDATE run (bad chatUrl)
"""
import json, sys
from pathlib import Path

INDEX = Path("/Users/omid/vulux1/tools/codex-chat-operator/index.mjs")
STATE = Path("/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json")

# ── Patch 1: fix partial match in verifyShipped ───────────────────────────

text = INDEX.read_text()

OLD = \
"""  if (taskId) {
    const allLs = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin"], { cwd: root, encoding: "utf8" });
    const ticketLower = taskId.toLowerCase().replace(/^(vul|adm)-/, "vul-");
    const lines = (allLs.stdout || "").split("\\n");
    const match = lines.find((l) => l.toLowerCase().includes(ticketLower.replace(/^vul-/, "")));
    if (match && match.trim()) return { verified: true, reason: "partial-match branch: " + match.trim() };
  }"""

NEW = \
"""  if (taskId) {
    const allLs = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin"], { cwd: root, encoding: "utf8" });
    // Normalize: "VUL-158" -> "vul-158", search only in the ref name (last token), not the SHA
    const ticketLower = taskId.toLowerCase();
    const lines = (allLs.stdout || "").split("\\n");
    const match = lines.find((l) => {
      const tokens = l.trim().split(/\\s+/);
      const refName = (tokens[1] || tokens[0] || "").toLowerCase();
      return refName.includes(ticketLower);
    });
    if (match && match.trim()) return { verified: true, reason: "partial-match branch: " + match.trim() };
  }"""

if OLD not in text:
    print("❌ verifyShipped partial-match anchor not found")
    sys.exit(1)

text = text.replace(OLD, NEW, 1)
INDEX.write_text(text)
print("✓ verifyShipped: partial match now checks ref name only, full ticket string")

# ── Patch 2: reset VUL-158 + CONSOLIDATE-NOTIFICATION-NAVIGATION ─────────

state = json.loads(STATE.read_text())

reset_tasks = ["VUL-158", "CONSOLIDATE-NOTIFICATION-NAVIGATION"]

for task_id in reset_tasks:
    # Mark any done/running runs as failed
    for run in state.get("runs", []):
        if run["taskId"] == task_id and run["status"] in ("done", "running", "dispatched", "creating-pr"):
            run["status"] = "failed"
            run["error"] = "Reset: false completion due to SHA hash match or wrong chatUrl."
            print(f"  ✗ reset run {run['runId']} ({task_id})")
    # Reset task to pending
    for task in state.get("tasks", []):
        if task["taskId"] == task_id:
            task["status"] = "pending"
            task["updatedAt"] = "2026-03-16T21:25:00.000Z"
            print(f"  → {task_id} set to pending")

STATE.write_text(json.dumps(state, indent=2))
print("✓ State updated.")
print("\n✅ Done.")
