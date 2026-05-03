#!/usr/bin/env python3
"""
patch_v3b.py — fixes the two remaining items:
  1. In reconcileActiveRun: upgrade chatUrl to task-specific URL using latestTaskUrl
  2. Audit + reset false-done runs with no remote branch
"""
import json, subprocess, sys, re
from pathlib import Path

INDEX_PATH = Path("/Users/omid/vulux1/tools/codex-chat-operator/index.mjs")
STATE_PATH = Path("/Users/omid/vulux1/tools/codex-chat-operator/.data/state.json")
REPO_ROOT  = "/Users/omid/vulux1"

# ─── Patch 1: replace chatUrl line in reconcileActiveRun ─────────────────

text = INDEX_PATH.read_text()

# The line we want to replace is exactly:
#   "    chatUrl: inspected.href || activeRun.chatUrl,"
# inside the updateRun({...}) block in reconcileActiveRun

OLD_CHAT_URL = "    chatUrl: inspected.href || activeRun.chatUrl,"
NEW_CHAT_URL = """\
    chatUrl: (inspected.href && inspected.href.includes("/tasks/"))
      ? inspected.href
      : (inspected.latestTaskUrl && inspected.latestTaskUrl.includes("/tasks/"))
        ? inspected.latestTaskUrl
        : (inspected.href || activeRun.chatUrl),"""

if OLD_CHAT_URL not in text:
    print("❌ chatUrl anchor not found in index.mjs")
    sys.exit(1)

text = text.replace(OLD_CHAT_URL, NEW_CHAT_URL, 1)
INDEX_PATH.write_text(text)
print("✓ index.mjs: chatUrl upgraded to task-specific URL in reconcileActiveRun")

# ─── Patch 2: audit + reset false-done runs ──────────────────────────────

print("\n=== Auditing false-done runs ===")

# Get all remote branch lines
result = subprocess.run(
    ["git", "ls-remote", "--heads", "origin"],
    cwd=REPO_ROOT, capture_output=True, text=True
)
remote_text = result.stdout.lower()

state = json.loads(STATE_PATH.read_text())

to_reset = []
skipped = []

for task in state.get("tasks", []):
    if task["status"] != "done":
        continue
    task_id = task["taskId"]
    if task_id.startswith("CONSOLIDATE-"):
        continue  # no branch expected

    # Find the done run
    done_run = next(
        (r for r in reversed(state.get("runs", [])) if r["taskId"] == task_id and r["status"] == "done"),
        None
    )
    if not done_run:
        continue

    branch = (done_run.get("branch") or "").lower()
    # Extract ticket number: vul-156 -> "vul-156" OR "156"
    m = re.match(r"(vul|adm)-(\d+)", task_id, re.IGNORECASE)
    ticket_num = m.group(0).lower() if m else task_id.lower()

    has_exact   = branch and branch in remote_text
    has_partial = ticket_num and any(ticket_num in line for line in remote_text.splitlines())

    if has_exact or has_partial:
        reason = "exact" if has_exact else "partial"
        print(f"  ✓ {task_id}: verified ({reason} match)")
        skipped.append(task_id)
    else:
        print(f"  ✗ {task_id}: no remote branch (expected: {branch or 'n/a'})")
        to_reset.append(task_id)

if not to_reset:
    print("\nAll done tasks verified — nothing to reset.")
else:
    print(f"\nResetting {len(to_reset)} false-done task(s):")
    for task_id in to_reset:
        # Mark done runs as failed
        for run in state.get("runs", []):
            if run["taskId"] == task_id and run["status"] == "done":
                run["status"] = "failed"
                run["error"] = "Reset: no remote branch at audit time."
                print(f"  → reset run {run['runId']}")
        # Reset task to pending
        for task in state["tasks"]:
            if task["taskId"] == task_id:
                task["status"] = "pending"
                task["updatedAt"] = "2026-03-16T21:00:00.000Z"

    STATE_PATH.write_text(json.dumps(state, indent=2))
    print("✓ state.json updated.")

print("\n✅ patch_v3b complete.")
