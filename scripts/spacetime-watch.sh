#!/usr/bin/env bash
set -euo pipefail

SPACETIME_BIN="${SPACETIME_BIN:-}"
DB_NAME="${1:-${EXPO_PUBLIC_SPACETIMEDB_NAME:-vulu}}"
NUM_UPDATES="${SPACETIME_WATCH_NUM_UPDATES:-}"
TIMEOUT_SECONDS="${SPACETIME_WATCH_TIMEOUT_SECONDS:-}"
PRINT_INITIAL="${SPACETIME_WATCH_PRINT_INITIAL:-false}"

if [[ -z "$SPACETIME_BIN" ]]; then
  if command -v spacetime >/dev/null 2>&1; then
    SPACETIME_BIN="$(command -v spacetime)"
  elif [[ -x "$HOME/.local/bin/spacetime" ]]; then
    SPACETIME_BIN="$HOME/.local/bin/spacetime"
  fi
fi

if [[ -z "$SPACETIME_BIN" ]] || [[ ! -x "$SPACETIME_BIN" ]]; then
  echo "spacetime CLI not found. Install it or set SPACETIME_BIN=/full/path/to/spacetime" >&2
  exit 1
fi

cat <<MSG
[spacetime-watch]
  database: $DB_NAME
  cli:      $(command -v "$SPACETIME_BIN")
  mode:     live subscribe

Press Ctrl+C to stop.
MSG

EXTRA_ARGS=()
if [[ -n "$NUM_UPDATES" ]]; then
  EXTRA_ARGS+=(--num-updates "$NUM_UPDATES")
fi
if [[ -n "$TIMEOUT_SECONDS" ]]; then
  EXTRA_ARGS+=(--timeout "$TIMEOUT_SECONDS")
fi
if [[ "$PRINT_INITIAL" == "true" ]]; then
  EXTRA_ARGS+=(--print-initial-update)
fi

"$SPACETIME_BIN" subscribe "$DB_NAME" \
  "SELECT * FROM global_message_item" \
  "SELECT * FROM friendship" \
  "SELECT * FROM social_user_item" \
  "SELECT * FROM notification_item" \
  --confirmed true \
  "${EXTRA_ARGS[@]}"
