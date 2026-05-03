#!/usr/bin/env python3
"""
patch_index_final.py — applies all index.mjs patches atomically using Python
so multiline matching is reliable.
"""
import re, sys
from pathlib import Path

INDEX = Path("/Users/omid/vulux1/tools/codex-chat-operator/index.mjs")
text = INDEX.read_text()

errors = []
patches = 0

def replace_once(label, old, new):
    global text, patches
    if old not in text:
        errors.append(f"❌ {label}: anchor not found")
        return False
    text = text.replace(old, new, 1)
    print(f"  ✓ {label}")
    patches += 1
    return True

# 1. Import: add getLatestTaskUrl
replace_once(
    "import getLatestTaskUrl",
    "import { clickCreatePRButton, inspectCodexRun, sendPromptToCodex }",
    "import { clickCreatePRButton, getLatestTaskUrl, inspectCodexRun, sendPromptToCodex }"
)

# 2. Replace verifyShipped function body
OLD_VERIFY = \
"""function verifyShipped(branch, repoRoot) {
  const root = repoRoot || "/Users/omid/vulux1";
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  const pr = _spawnSyncVerify("gh", ["pr", "list", "--head", branch, "--json", "url", "--limit", "1"], { cwd: root, encoding: "utf8" });
  try { const prs = JSON.parse(pr.stdout || "[]"); if (prs.length > 0) return { verified: true, reason: "PR: " + prs[0].url }; } catch(_e) {}
  return { verified: false, reason: "no remote branch and no PR for: " + branch };
}"""

NEW_VERIFY = \
"""function verifyShipped(branch, taskId, probeHasViewPR, repoRoot) {
  // Primary signal: Codex UI shows "View PR" button → PR is live on GitHub
  if (probeHasViewPR) return { verified: true, reason: "Codex shows View PR button" };
  const root = repoRoot || "/Users/omid/vulux1";
  // Exact branch name
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  // Partial match by ticket ID (Codex may push under a different prefix)
  if (taskId) {
    const allLs = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin"], { cwd: root, encoding: "utf8" });
    const ticketLower = taskId.toLowerCase().replace(/^(vul|adm)-/, "vul-");
    const lines = (allLs.stdout || "").split("\\n");
    const match = lines.find((l) => l.toLowerCase().includes(ticketLower.replace(/^vul-/, "")));
    if (match && match.trim()) return { verified: true, reason: "partial-match branch: " + match.trim() };
  }
  return { verified: false, reason: "no remote branch for: " + branch + (taskId ? " (" + taskId + ")" : "") };
}"""

replace_once("verifyShipped body", OLD_VERIFY, NEW_VERIFY)

# 3. Fix verifyShipped call site
replace_once(
    "verifyShipped call site",
    "      const ship = verifyShipped(branch);",
    "      const ship = verifyShipped(branch, activeRun.taskId, inspected.hasViewPR);"
)

# 4. Fix clickCreatePRButton to use task page URL
replace_once(
    "clickCreatePRButton URL",
    "      const clickResult = clickCreatePRButton(activeRun.targetUrl);",
    "      const taskPageUrl = (inspected.href && inspected.href.includes(\"/tasks/\")) ? inspected.href : (activeRun.chatUrl || activeRun.targetUrl);\n      const clickResult = clickCreatePRButton(taskPageUrl);"
)

# 5. Post-dispatch URL polling (replace sendPromptToCodex result handling)
OLD_SEND = \
"""    const result = sendPromptToCodex(prompt, { targetUrl });
    updateRun(state, run.runId, {
      status: "running",
      chatUrl: result.chatUrl,
      error: null,
    });
    saveState(state);
    console.log(`Dispatched ${task.taskId} as run ${run.runId}`);
    console.log(`Chat URL: ${result.chatUrl}`);"""

NEW_SEND = \
"""    const result = sendPromptToCodex(prompt, { targetUrl });
    // Poll up to 30s for Codex to navigate to a task-specific URL
    let taskUrl = result.chatUrl;
    for (let _i = 0; _i < 10 && !taskUrl?.includes("/tasks/"); _i++) {
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
    console.log(`Dispatched ${task.taskId} as run ${run.runId}`);
    console.log(`Chat URL: ${taskUrl}`);"""

replace_once("post-dispatch URL poll", OLD_SEND, NEW_SEND)

print()
if errors:
    for e in errors:
        print(e)
    print(f"\n{len(errors)} errors — NOT writing file.")
    sys.exit(1)

INDEX.write_text(text)
print(f"✅ Wrote index.mjs ({patches} patches applied)")
