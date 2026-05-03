#!/usr/bin/env bash
set -euo pipefail

error_count=0
warn_count=0

info() { printf '[env:info] %s\n' "$1"; }
ok() { printf '[env:ok] %s\n' "$1"; }
warn() { warn_count=$((warn_count + 1)); printf '[env:warn] %s\n' "$1"; }
fail() { error_count=$((error_count + 1)); printf '[env:error] %s\n' "$1"; }

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(printf '%s' "$key" | xargs)"
    value="${value%$'\r'}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$file"
}

is_url() {
  [[ "$1" =~ ^https?://.+$ || "$1" =~ ^wss?://.+$ ]]
}

require_var() {
  local key="$1"
  local validator="${2:-}"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    fail "$key is required"
    return
  fi
  if [[ "$validator" == "url" ]] && ! is_url "$value"; then
    fail "$key must be an http(s) or ws(s) URL"
    return
  fi
  ok "$key is set"
}

warn_if_set() {
  local key="$1"
  local reason="$2"
  if [[ -n "${!key:-}" ]]; then
    warn "$key is legacy and should be removed. $reason"
  fi
}

load_env_file ".env"
load_env_file ".env.local"
load_env_file "backend/.env"

info "Checking Vulu Railway + Clerk environment"

require_var "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
require_var "EXPO_PUBLIC_RAILWAY_API_BASE_URL" "url"
require_var "EXPO_PUBLIC_RAILWAY_WS_BASE_URL" "url"

require_var "CLERK_JWKS_URL" "url"
require_var "CLERK_JWT_ISSUER" "url"
require_var "CLERK_JWT_AUDIENCE"

require_var "R2_ACCOUNT_ID"
require_var "R2_ACCESS_KEY_ID"
require_var "R2_SECRET_ACCESS_KEY"
require_var "R2_BUCKET_NAME"
require_var "R2_PUBLIC_BASE_URL" "url"

printf '\n[env:summary] %s error(s), %s warning(s)\n' "$error_count" "$warn_count"

if [[ "$error_count" -gt 0 ]]; then
  exit 1
fi
