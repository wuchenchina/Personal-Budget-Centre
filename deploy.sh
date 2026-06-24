#!/usr/bin/env bash

set -Eeuo pipefail

SERVER_USER="${SERVER_USER:-root}"
SERVER_IP="${SERVER_IP:-140.210.14.109}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_SSH_KEY="${SERVER_SSH_KEY:-/Users/wuchen/Documents/140.210.14.109_sshkey_id_ed25519}"
REMOTE_PATH="${REMOTE_PATH:-/www/wwwroot/bc.tool.axchen.top}"
DOMAIN="${DOMAIN:-bc.tool.axchen.top}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${SERVER_USER}@${SERVER_IP}"
SSH_OPTS=(-i "${SERVER_SSH_KEY}" -p "${SERVER_PORT}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -i ${SERVER_SSH_KEY} -p ${SERVER_PORT} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

APP_ENV="${APP_ENV:-production}"
APP_URL="${APP_URL:-https://${DOMAIN}}"
API_URL="${API_URL:-https://${DOMAIN}}"
DB_HOST="${DB_HOST:-172.17.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-bc_tool_axchen_t}"
DB_USER="${DB_USER:-bc_tool_axchen_t}"
DB_PASSWORD="${DB_PASSWORD:-D1M5KsXi24A6ftXn}"
APP_KEY="${APP_KEY:-${DB_PASSWORD}}"
SESSION_COOKIE="${SESSION_COOKIE:-budgetcentre_session}"
CSRF_COOKIE="${CSRF_COOKIE:-budgetcentre_csrf}"
WEBAUTHN_RP_ID="${WEBAUTHN_RP_ID:-${DOMAIN}}"
WEBAUTHN_RP_NAME="${WEBAUTHN_RP_NAME:-BudgetCentre}"
WEBAUTHN_ORIGIN="${WEBAUTHN_ORIGIN:-https://${DOMAIN}}"
CASDOOR_SERVER_URL="${CASDOOR_SERVER_URL:-https://sso.axchen.top}"
CASDOOR_CLIENT_ID="${CASDOOR_CLIENT_ID:-3e4912a22fdbce3dd6ca}"
CASDOOR_REDIRECT_URI="${CASDOOR_REDIRECT_URI:-https://${DOMAIN}/api/callback}"
CASDOOR_CLIENT_SECRET="${CASDOOR_CLIENT_SECRET:-}"
SMTP_HOST="${SMTP_HOST:-smtp.feishu.cn}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_USERNAME="${SMTP_USERNAME:-no-reply@hyis.7zh8.cn}"
SMTP_PASSWORD="${SMTP_PASSWORD:-7EgOfbbYtMuNxoOD}"
MAIL_FROM="${MAIL_FROM:-${SMTP_USERNAME}}"
MAIL_FROM_NAME="${MAIL_FROM_NAME:-BudgetCentre}"
WEB_BIND="${WEB_BIND:-127.0.0.1:18080}"
APP_STORAGE_ROOT="${APP_STORAGE_ROOT:-./storage}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

write_env() {
  local target="$1"
  {
    env_line APP_ENV "${APP_ENV}"
    env_line APP_KEY "${APP_KEY}"
    env_line APP_URL "${APP_URL}"
    env_line API_URL "${API_URL}"
    env_line DB_HOST "${DB_HOST}"
    env_line DB_PORT "${DB_PORT}"
    env_line DB_NAME "${DB_NAME}"
    env_line DB_USER "${DB_USER}"
    env_line DB_PASSWORD "${DB_PASSWORD}"
    env_line SESSION_COOKIE "${SESSION_COOKIE}"
    env_line CSRF_COOKIE "${CSRF_COOKIE}"
    env_line WEBAUTHN_RP_ID "${WEBAUTHN_RP_ID}"
    env_line WEBAUTHN_RP_NAME "${WEBAUTHN_RP_NAME}"
    env_line WEBAUTHN_ORIGIN "${WEBAUTHN_ORIGIN}"
    env_line CASDOOR_SERVER_URL "${CASDOOR_SERVER_URL}"
    env_line CASDOOR_CLIENT_ID "${CASDOOR_CLIENT_ID}"
    env_line CASDOOR_REDIRECT_URI "${CASDOOR_REDIRECT_URI}"
    env_line CASDOOR_CLIENT_SECRET "${CASDOOR_CLIENT_SECRET}"
    env_line SMTP_HOST "${SMTP_HOST}"
    env_line SMTP_PORT "${SMTP_PORT}"
    env_line SMTP_USERNAME "${SMTP_USERNAME}"
    env_line SMTP_PASSWORD "${SMTP_PASSWORD}"
    env_line MAIL_FROM "${MAIL_FROM}"
    env_line MAIL_FROM_NAME "${MAIL_FROM_NAME}"
    env_line WEB_BIND "${WEB_BIND}"
    env_line APP_STORAGE_ROOT "${APP_STORAGE_ROOT}"
  } >"${target}"
}

env_line() {
  local key="$1"
  local value="$2"
  value="${value//$'\n'/}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "${key}" "${value}"
}

main() {
  require_command ssh
  require_command rsync
  require_command yarn
  require_command go

  echo "Building frontend..."
  (cd "${PROJECT_ROOT}/code/frontend" && yarn install --frozen-lockfile && yarn build)

  echo "Verifying Go backend..."
  (cd "${PROJECT_ROOT}/code/backend" && go test ./...)

  local tmp_env
  tmp_env="$(mktemp)"
  trap 'rm -f "${tmp_env}"' EXIT
  write_env "${tmp_env}"

  echo "Uploading project files to ${REMOTE}:${REMOTE_PATH}..."
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p '${REMOTE_PATH}'"
  rsync -az --delete \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'storage/' \
    --exclude 'code/frontend/node_modules' \
    --exclude 'code/frontend/dist' \
    --exclude 'code/backend-php-legacy/vendor' \
    -e "${RSYNC_SSH}" \
    "${PROJECT_ROOT}/" "${REMOTE}:${REMOTE_PATH}/"
  rsync -az -e "${RSYNC_SSH}" "${tmp_env}" "${REMOTE}:${REMOTE_PATH}/.env"
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p '${REMOTE_PATH}/storage/exports' '${REMOTE_PATH}/storage/tmp' '${REMOTE_PATH}/storage/logs' && chmod 600 '${REMOTE_PATH}/.env'"

  cat <<EOF

Upload complete.
No Docker or database management was performed.

On the server, run manually when ready:
  cd ${REMOTE_PATH}
  docker compose up -d --build

BaoTa reverse proxy target:
  http://${WEB_BIND}
EOF
}

main "$@"
