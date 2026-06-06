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

DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="bc_tool_axchen_t"
DB_USER="bc_tool_axchen_t"
DB_PASSWORD="D1M5KsXi24A6ftXn"

WEBAUTHN_RP_ID="${DOMAIN}"
WEBAUTHN_RP_NAME="BudgetCentre"
WEBAUTHN_ORIGIN="https://${DOMAIN}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_ROOT="${PROJECT_ROOT}/code"
FRONTEND_DIR="${CODE_ROOT}/frontend"
BACKEND_DIR="${CODE_ROOT}/backend"
DATABASE_DIR="${CODE_ROOT}/database"
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
EOF
}

remote_composer_install() {
  remote_exec "cd '${REMOTE_PATH}/backend' && \
    mkdir -p vendor/composer && \
    http_proxy='${REMOTE_HTTP_PROXY}' \
    https_proxy='${REMOTE_HTTPS_PROXY}' \
    HTTP_PROXY='${REMOTE_HTTP_PROXY}' \
    HTTPS_PROXY='${REMOTE_HTTPS_PROXY}' \
    COMPOSER_ALLOW_SUPERUSER=1 \
    composer install --no-dev --optimize-autoloader --no-interaction"
}

require_command ssh
require_command rsync
require_command composer
require_command yarn

if [[ ! -f "${SERVER_SSH_KEY}" ]]; then
  echo "SSH key not found: ${SERVER_SSH_KEY}" >&2
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

echo "[remote] Preparing ${REMOTE_PATH}"
remote_exec "mkdir -p '${REMOTE_PATH}/backend' '${REMOTE_PATH}/database' '${REMOTE_PATH}/backend/storage/exports'"

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

echo "[remote] Writing backend .env for ${DOMAIN}"
write_remote_env

echo "[remote] Installing backend dependencies"
remote_composer_install

if [[ "${SKIP_DB_INIT:-0}" != "1" ]]; then
  echo "[remote] Initializing existing MySQL database ${DB_NAME}"
  remote_exec "cd '${REMOTE_PATH}/backend' && php bin/init-database.php --yes"
fi

cat <<EOF

Deploy finished.

Domain:
  ${APP_URL}

Important web server rule:
  Route /api/* to ${REMOTE_PATH}/backend/public/index.php

This script does not create the MySQL database. It only initializes tables, seed data, and views in:
  ${DB_NAME}
EOF
