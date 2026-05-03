#!/usr/bin/env bash
# Codex Chat Operator — dispatch wrapper
# Called by launchd every 5 minutes.
# Recovers runs stuck for >60 min, then dispatches the next pending task.

set -euo pipefail

REPO="/Users/omid/vulux1"
OPERATOR="$REPO/tools/codex-chat-operator/index.mjs"
LOG="$REPO/tools/codex-chat-operator/.data/dispatch.log"
NODE=$(command -v node || echo /usr/local/bin/node)

mkdir -p "$(dirname "$LOG")"

{
  echo ""
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
  cd "$REPO"
  "$NODE" "$OPERATOR" dispatch-next --recover-stale-minutes 60
} >> "$LOG" 2>&1

exit 0
