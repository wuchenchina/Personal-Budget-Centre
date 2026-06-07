#!/usr/bin/env bash

set -Eeuo pipefail

SERVER_USER="root"
SERVER_IP="140.210.14.109"
SERVER_PORT="22"
SERVER_SSH_KEY="/Users/wuchenchina/Documents/140.210.14.109_sshkey_id_ed25519"
REMOTE_PATH="/www/wwwroot/bc.tool.axchen.top"

DOMAIN="bc.tool.axchen.top"
APP_ENV="production"
APP_URL="https://${DOMAIN}"
API_URL="https://${DOMAIN}"
VITE_API_BASE_URL="${API_URL}"

REMOTE_HTTP_PROXY="http://10.0.0.1:7890"
REMOTE_HTTPS_PROXY="http://10.0.0.1:7890"
DEPLOY_MODE="${DEPLOY_MODE:-sync}"
RUN_DB_INIT="${RUN_DB_INIT:-0}"
CONFIRM_FRESH_DEPLOY="${CONFIRM_FRESH_DEPLOY:-}"
DEPLOY_COMMAND="${1:-}"

DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="bc_tool_axchen_t"
DB_USER="bc_tool_axchen_t"
DB_PASSWORD="D1M5KsXi24A6ftXn"

WEBAUTHN_RP_ID="${DOMAIN}"
WEBAUTHN_RP_NAME="BudgetCentre"
WEBAUTHN_ORIGIN="https://${DOMAIN}"

SMTP_HOST="smtp.feishu.cn"
SMTP_PORT="465"
SMTP_USERNAME="no-reply@hyis.7zh8.cn"
SMTP_PASSWORD="7EgOfbbYtMuNxoOD"
MAIL_FROM="${SMTP_USERNAME}"
MAIL_FROM_NAME="BudgetCentre"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_ROOT="${PROJECT_ROOT}/code"
FRONTEND_DIR="${CODE_ROOT}/frontend"
BACKEND_DIR="${CODE_ROOT}/backend"
DATABASE_DIR="${CODE_ROOT}/database"
FONT_DIR="${CODE_ROOT}/font"
REMOTE="${SERVER_USER}@${SERVER_IP}"
SSH_OPTS=(
  -i "${SERVER_SSH_KEY}"
  -p "${SERVER_PORT}"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
)
RSYNC_SSH="ssh -i ${SERVER_SSH_KEY} -p ${SERVER_PORT} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

remote_exec() {
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "$@"
}

write_remote_env() {
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "cat > '${REMOTE_PATH}/backend/.env'" <<EOF
APP_ENV=${APP_ENV}
APP_URL=${APP_URL}
API_URL=${API_URL}

DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID}
WEBAUTHN_RP_NAME=${WEBAUTHN_RP_NAME}
WEBAUTHN_ORIGIN=${WEBAUTHN_ORIGIN}

SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USERNAME=${SMTP_USERNAME}
SMTP_PASSWORD=${SMTP_PASSWORD}
MAIL_FROM=${MAIL_FROM}
MAIL_FROM_NAME=${MAIL_FROM_NAME}
EOF
}

remote_composer_install() {
  local command="cd '${REMOTE_PATH}/backend' && \
    mkdir -p vendor/composer && \
    http_proxy='${REMOTE_HTTP_PROXY}' \
    https_proxy='${REMOTE_HTTPS_PROXY}' \
    HTTP_PROXY='${REMOTE_HTTP_PROXY}' \
    HTTPS_PROXY='${REMOTE_HTTPS_PROXY}' \
    COMPOSER_ALLOW_SUPERUSER=1 \
    composer install --no-dev --optimize-autoloader --no-interaction"

  if ! remote_exec "${command}"; then
    echo "[remote] Composer install failed once. Retrying..."
    remote_exec "${command}"
  fi
}

remote_root_status() {
  remote_exec "if [ -d '${REMOTE_PATH}' ] && [ \"\$(find '${REMOTE_PATH}' -mindepth 1 -maxdepth 1 | head -n 1)\" ]; then echo 'not_empty'; else echo 'empty'; fi"
}

remote_clear_root() {
  remote_exec "mkdir -p '${REMOTE_PATH}' && \
    if command -v chattr >/dev/null 2>&1; then \
      find '${REMOTE_PATH}' -name '.user.ini' -exec chattr -i {} + 2>/dev/null || true; \
    fi && \
    find '${REMOTE_PATH}' -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
}

remote_fix_permissions() {
  remote_exec "find '${REMOTE_PATH}' -type d -exec chmod 755 {} + && \
    find '${REMOTE_PATH}' -type f -exec chmod 644 {} + && \
    chmod -R 775 '${REMOTE_PATH}/backend/storage' && \
    chmod 640 '${REMOTE_PATH}/backend/.env' && \
    find '${REMOTE_PATH}/backend/bin' -type f -name '*.php' -exec chmod 755 {} +"
}

require_command ssh
require_command rsync
require_command composer
require_command yarn

case "${DEPLOY_COMMAND}" in
  "")
    ;;
  "sync")
    DEPLOY_MODE="sync"
    ;;
  "migrate")
    DEPLOY_MODE="sync"
    RUN_DB_INIT="1"
    ;;
  "fresh")
    DEPLOY_MODE="fresh"
    CONFIRM_FRESH_DEPLOY="${DOMAIN}"
    ;;
  *)
    echo "Unknown deploy command: ${DEPLOY_COMMAND}" >&2
    echo "Usage: ./deploy.sh [sync|migrate|fresh]" >&2
    exit 1
    ;;
esac

if [[ ! -f "${SERVER_SSH_KEY}" ]]; then
  echo "SSH key not found: ${SERVER_SSH_KEY}" >&2
  exit 1
fi

if [[ "${DEPLOY_MODE}" != "sync" && "${DEPLOY_MODE}" != "fresh" ]]; then
  echo "Invalid DEPLOY_MODE: ${DEPLOY_MODE}. Use sync or fresh." >&2
  exit 1
fi

if [[ "${DEPLOY_MODE}" == "fresh" && "${CONFIRM_FRESH_DEPLOY}" != "${DOMAIN}" ]]; then
  echo "Fresh deploy is destructive. Re-run with:" >&2
  echo "  DEPLOY_MODE=fresh CONFIRM_FRESH_DEPLOY=${DOMAIN} ./deploy.sh" >&2
  exit 1
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "[local] Building frontend for ${DOMAIN}"
  (
    cd "${FRONTEND_DIR}"
    VITE_API_BASE_URL="${VITE_API_BASE_URL}" yarn build
  )
fi

echo "[local] Validating backend"
(
  cd "${BACKEND_DIR}"
  composer validate --strict
  composer check
  composer db:init:dry-run
)

echo "[remote] Root status: $(remote_root_status)"

if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
  echo "[remote] Fresh deploy requested. Clearing ${REMOTE_PATH}"
  remote_clear_root
  RUN_DB_INIT="1"
fi

echo "[remote] Preparing ${REMOTE_PATH}"
remote_exec "mkdir -p '${REMOTE_PATH}/backend' '${REMOTE_PATH}/database' '${REMOTE_PATH}/font' '${REMOTE_PATH}/backend/storage/exports'"

echo "[upload] frontend/dist -> ${REMOTE_PATH}"
rsync -az --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  "${FRONTEND_DIR}/dist/" \
  "${REMOTE}:${REMOTE_PATH}/"

echo "[upload] backend -> ${REMOTE_PATH}/backend"
rsync -az --delete --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  --exclude '.env' \
  --exclude 'vendor/' \
  --exclude 'storage/' \
  "${BACKEND_DIR}/" \
  "${REMOTE}:${REMOTE_PATH}/backend/"

echo "[upload] database -> ${REMOTE_PATH}/database"
rsync -az --delete --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  "${DATABASE_DIR}/" \
  "${REMOTE}:${REMOTE_PATH}/database/"

echo "[upload] font -> ${REMOTE_PATH}/font"
rsync -az --delete --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  "${FONT_DIR}/" \
  "${REMOTE}:${REMOTE_PATH}/font/"

echo "[remote] Writing backend .env for ${DOMAIN}"
write_remote_env

echo "[remote] Installing backend dependencies"
remote_composer_install

echo "[remote] Fixing uploaded file permissions"
remote_fix_permissions

if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
  echo "[remote] Fresh deploy requested. Checking database before reset"
  remote_exec "cd '${REMOTE_PATH}/backend' && php bin/reset-database.php --dry-run"
  echo "[remote] Clearing existing MySQL objects in ${DB_NAME}"
  remote_exec "cd '${REMOTE_PATH}/backend' && php bin/reset-database.php --yes"
fi

if [[ "${RUN_DB_INIT}" == "1" && "${SKIP_DB_INIT:-0}" != "1" ]]; then
  echo "[remote] Initializing existing MySQL database ${DB_NAME}"
  remote_exec "cd '${REMOTE_PATH}/backend' && php bin/init-database.php --yes"
else
  echo "[remote] Skipping database initialization for sync deploy"
fi

cat <<EOF

Deploy finished.

Domain:
  ${APP_URL}

Important web server rule:
  Route /api/* to ${REMOTE_PATH}/backend/public/index.php

This script never creates the MySQL database.
Sync mode does not reset the root path or database.
Fresh mode clears the remote root path and resets existing MySQL objects before initialization.

Deployment mode:
  ${DEPLOY_MODE}

Database initialization:
  ${RUN_DB_INIT}
EOF
