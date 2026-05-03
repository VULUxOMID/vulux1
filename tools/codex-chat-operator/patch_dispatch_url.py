#!/usr/bin/env python3
"""
patch_dispatch_url.py — fix post-dispatch URL poll:
  Before sending, record the current latest task URL.
  After sending, only accept a URL that's DIFFERENT (the new task).
  Timeout = 30s, then fall back to generic /codex URL.
"""
from pathlib import Path, sys
import sys

INDEX = Path("/Users/omid/vulux1/tools/codex-chat-operator/index.mjs")
text = INDEX.read_text()

OLD = \
"""    const result = sendPromptToCodex(prompt, { targetUrl });
    // Poll up to 30s for Codex to navigate to a task-specific URL
    let taskUrl = result.chatUrl;
    for (let _i = 0; _i < 10 && !taskUrl?.includes("/tasks/"); _i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      const polledUrl = getLatestTaskUrl(targetUrl);
      if (polledUrl && polledUrl.includes("/tasks/")) { taskUrl = polledUrl; break; }
    }"""

NEW = \
"""    // Record the current top task URL BEFORE submitting so we can detect the new one
    const prevTaskUrl = getLatestTaskUrl(targetUrl);
    const result = sendPromptToCodex(prompt, { targetUrl });
    // Poll up to 30s for Codex to create a NEW task (URL different from prevTaskUrl)
    let taskUrl = result.chatUrl;
    for (let _i = 0; _i < 10; _i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      const polledUrl = getLatestTaskUrl(targetUrl);
      if (polledUrl && polledUrl.includes("/tasks/") && polledUrl !== prevTaskUrl) {
        taskUrl = polledUrl; break;
      }
    }"""

if OLD not in text:
    print("❌ anchor not found")
    sys.exit(1)

text = text.replace(OLD, NEW, 1)
INDEX.write_text(text)
print("✓ Fixed post-dispatch URL poll to skip previous task URL")
print("✅ Done")
