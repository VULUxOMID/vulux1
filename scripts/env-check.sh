#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---app}"

ENV_FILES=(
  "$PROJECT_ROOT/.env.local"
  "$PROJECT_ROOT/.env"
)

errors=0
warnings=0

print_usage() {
  cat <<'USAGE'
Usage:
  ./scripts/env-check.sh [--app|--legacy-api|--all]

Modes:
  --app         Check core client + SpacetimeDB variables (default)
  --legacy-api  Check optional legacy HTTP API variables
  --all         Run both checks
USAGE
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

strip_quotes() {
  local value="$1"
  value="$(trim "$value")"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

lookup_in_file() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi

  local line
  line="$(awk -v k="$key" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" k "=" {
      sub(/^[[:space:]]*(export[[:space:]]+)?[^=]*=/, "", $0);
      print $0;
    }
  ' "$file" | tail -n 1)"

  if [[ -z "${line:-}" ]]; then
    return 1
  fi

  strip_quotes "$line"
}

get_value() {
  local key="$1"
  local from_env="${!key-}"
  if [[ -n "$(trim "${from_env:-}")" ]]; then
    printf '%s|%s' "$(trim "$from_env")" "env"
    return 0
  fi

  local file value
  for file in "${ENV_FILES[@]}"; do
    if value="$(lookup_in_file "$key" "$file")" && [[ -n "$(trim "$value")" ]]; then
      printf '%s|%s' "$(trim "$value")" "$file"
      return 0
    fi
  done

  printf '|'
}

mask_value() {
  local value="$1"
  local length="${#value}"
  if (( length <= 12 )); then
    printf '%s' "$value"
    return 0
  fi
  printf '%s...%s' "${value:0:8}" "${value:length-4:4}"
}

ok() {
  printf 'OK      %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN    %s\n' "$1"
}

err() {
  errors=$((errors + 1))
  printf 'ERROR   %s\n' "$1"
}

validate_http_url() {
  local key="$1"
  local value="$2"
  if [[ ! "$value" =~ ^https?:// ]]; then
    err "$key must start with http:// or https://"
    return
  fi
  if [[ "$value" == *"localhost"* || "$value" == *"127.0.0.1"* ]]; then
    warn "$key points to localhost. That is usually wrong for shared preview deployments."
  fi
}

validate_ws_url() {
  local key="$1"
  local value="$2"
  if [[ ! "$value" =~ ^wss?:// ]]; then
    err "$key must start with ws:// or wss://"
    return
  fi
}

validate_token_template() {
  local key="$1"
  local value="$2"
  if [[ "$value" == *"placeholder"* || "$value" == *"YOUR_"* ]]; then
    err "$key is still a placeholder value"
  fi
}

validate_non_placeholder() {
  local key="$1"
  local value="$2"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" == *"placeholder"* || "$normalized" == *"your_"* || "$value" == *"<"* ]]; then
    err "$key is still a placeholder value"
  fi
}

validate_true_false() {
  local key="$1"
  local value="$2"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" != "true" && "$normalized" != "false" ]]; then
    warn "$key should be 'true' or 'false'"
  fi
}

check_required_var() {
  local key="$1"
  local validator="${2:-}"
  local result value source

  result="$(get_value "$key")"
  value="${result%%|*}"
  source="${result#*|}"

  if [[ -z "$value" ]]; then
    err "$key is missing"
    return
  fi

  if [[ -n "$validator" ]]; then
    "$validator" "$key" "$value"
  fi

  ok "$key found (${source}): $(mask_value "$value")"
}

check_optional_var() {
  local key="$1"
  local validator="${2:-}"
  local result value source

  result="$(get_value "$key")"
  value="${result%%|*}"
  source="${result#*|}"

  if [[ -z "$value" ]]; then
    warn "$key is not set"
    return
  fi

  if [[ -n "$validator" ]]; then
    "$validator" "$key" "$value"
  fi

  ok "$key found (${source}): $(mask_value "$value")"
}

run_app_checks() {
  printf '\n%s\n' 'App checks (Expo + SpacetimeDB)'
  printf '%s\n' '-------------------------------'

  check_required_var "EXPO_PUBLIC_SPACETIMEDB_URI" "validate_ws_url"
  check_required_var "EXPO_PUBLIC_SPACETIMEDB_NAME" "validate_non_placeholder"
  check_required_var "EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID" "validate_non_placeholder"

  check_optional_var "EXPO_PUBLIC_SPACETIMEAUTH_ISSUER" "validate_http_url"
  check_optional_var "EXPO_PUBLIC_SPACETIMEAUTH_SCHEME"
  check_optional_var "EXPO_PUBLIC_SPACETIMEAUTH_REDIRECT_URI"
  check_optional_var "EXPO_PUBLIC_SPACETIMEAUTH_SCOPES"
  check_optional_var "EXPO_PUBLIC_BACKEND_TOKEN_TEMPLATE" "validate_token_template"
  check_optional_var "EXPO_PUBLIC_ENABLE_REALTIME" "validate_true_false"
  check_optional_var "EXPO_PUBLIC_APP_ENV"
  check_optional_var "EXPO_PUBLIC_DATA_SOURCE"
  check_optional_var "EXPO_PUBLIC_API_BASE_URL" "validate_http_url"
  check_optional_var "EXPO_PUBLIC_BACKEND_TIMEOUT_MS"
  check_optional_var "EXPO_PUBLIC_BACKEND_REHYDRATE_MS"
}

run_legacy_api_checks() {
  printf '\n%s\n' 'Legacy API checks (optional compatibility mode)'
  printf '%s\n' '---------------------------------------------'

  check_required_var "EXPO_PUBLIC_API_BASE_URL" "validate_http_url"
  check_optional_var "EXPO_PUBLIC_BACKEND_TOKEN_TEMPLATE" "validate_token_template"
  check_optional_var "EXPO_PUBLIC_ENABLE_REALTIME" "validate_true_false"
}

case "$MODE" in
  --app)
    run_app_checks
    ;;
  --legacy-api)
    run_legacy_api_checks
    ;;
  --all)
    run_app_checks
    run_legacy_api_checks
    ;;
  -h|--help)
    print_usage
    exit 0
    ;;
  *)
    print_usage
    err "Unknown mode: $MODE"
    ;;
esac

printf '\n%s\n' 'Summary'
printf '%s\n' '-------'
printf 'Errors: %d\n' "$errors"
printf 'Warnings: %d\n' "$warnings"

if (( errors > 0 )); then
  exit 1
fi

exit 0
