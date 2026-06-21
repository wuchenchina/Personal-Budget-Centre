#!/usr/bin/env bash

set -Eeuo pipefail

SERVER_USER="root"
SERVER_IP="140.210.14.109"
SERVER_PORT="22"
SERVER_SSH_KEY="/Users/wuchen/Documents/140.210.14.109_sshkey_id_ed25519"
REMOTE_PATH="/www/wwwroot/bc.tool.axchen.top"

DOMAIN="bc.tool.axchen.top"
APP_ENV="production"
APP_URL="https://${DOMAIN}"
API_URL="https://${DOMAIN}"
VITE_API_BASE_URL="${API_URL}"

REMOTE_HTTP_PROXY="http://10.0.0.1:7890"
REMOTE_HTTPS_PROXY="http://10.0.0.1:7890"
DEPLOY_MODE="${DEPLOY_MODE:-sync}"
RUN_DB_MIGRATE=0
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
REMOTE_DEPLOY_TOKEN="budgetcentre-deploy-$(date +%Y%m%d%H%M%S)-$$"
DEPLOY_STARTED_AT="$(date +%s)"
CURRENT_STEP="bootstrap"
STEP_INDEX=0
TOTAL_STEPS=0
SSH_OPTS=(
  -i "${SERVER_SSH_KEY}"
  -p "${SERVER_PORT}"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)
RSYNC_SSH="ssh -i ${SERVER_SSH_KEY} -p ${SERVER_PORT} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=4"

if [[ -t 1 && "${NO_COLOR:-0}" != "1" ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BLUE=""
  C_CYAN=""
fi

elapsed_since() {
  local started_at="$1"
  local finished_at
  finished_at="$(date +%s)"
  printf '%ss' "$((finished_at - started_at))"
}

print_banner() {
  cat <<EOF

${C_BOLD}${C_CYAN}BudgetCentre Deploy${C_RESET}
${C_DIM}────────────────────────────────────────${C_RESET}
Mode        ${DEPLOY_COMMAND:-sync}
Domain      ${APP_URL}
Remote      ${REMOTE}:${REMOTE_PATH}
Database    ${DB_NAME}
DB action   $(db_action_label)
Token       ${REMOTE_DEPLOY_TOKEN}
${C_DIM}────────────────────────────────────────${C_RESET}
EOF
}

db_action_label() {
  if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
    printf 'fresh reset + init'
  elif [[ "${RUN_DB_MIGRATE}" == "1" ]]; then
    printf 'non-destructive migration'
  else
    printf 'none'
  fi
}

log_info() {
  printf '%s\n' "${C_DIM}›${C_RESET} $*"
}

log_hint() {
  printf '%s\n' "${C_DIM}›${C_RESET} $*" >&2
}

log_warn() {
  printf '%s\n' "${C_YELLOW}!${C_RESET} $*" >&2
}

log_error() {
  printf '%s\n' "${C_RED}✖${C_RESET} $*" >&2
}

run_step() {
  local title="$1"
  shift
  STEP_INDEX=$((STEP_INDEX + 1))
  CURRENT_STEP="${title}"
  local started_at
  started_at="$(date +%s)"

  printf '\n%s [%02d/%02d] %s%s\n' "${C_BLUE}◆${C_RESET}" "${STEP_INDEX}" "${TOTAL_STEPS}" "${C_BOLD}" "${title}${C_RESET}"
  if "$@"; then
    printf '%s %s %s%s\n' "${C_GREEN}✓${C_RESET}" "${title}" "${C_DIM}" "($(elapsed_since "${started_at}"))${C_RESET}"
  else
    local status=$?
    printf '%s %s %s%s\n' "${C_RED}✖${C_RESET}" "${title}" "${C_DIM}" "failed after $(elapsed_since "${started_at}")${C_RESET}" >&2
    return "${status}"
  fi
}

finish_deploy() {
  local status=$?
  trap - EXIT
  if [[ "${status}" -eq 0 ]]; then
    printf '\n%s Deploy finished in %s\n' "${C_GREEN}✓${C_RESET}" "$(elapsed_since "${DEPLOY_STARTED_AT}")"
    return 0
  fi

  if [[ "${status}" -ne 130 ]]; then
    log_error "Deploy failed during: ${CURRENT_STEP}"
    if [[ "${CURRENT_STEP}" == "preflight" ]]; then
      log_hint "Fix the command or mode shown above, then run deploy again."
    else
      log_hint "Re-run the same command after fixing the error above. Use SKIP_BUILD=1 only if the frontend build is already current."
    fi
  fi

  return "${status}"
}

trap finish_deploy EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

remote_exec() {
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "$@"
}

remote_exec_tracked() {
  local command="$1"
  local quoted_command
  quoted_command="$(printf '%q' "${command}")"
  remote_exec "BUDGETCENTRE_DEPLOY_TOKEN='${REMOTE_DEPLOY_TOKEN}' exec -a '${REMOTE_DEPLOY_TOKEN}' bash -lc ${quoted_command}"
}

cleanup_remote_deploy() {
  echo
  log_warn "Interrupt received. Stopping remote deploy tasks for ${REMOTE_DEPLOY_TOKEN}"
  remote_exec "pkill -TERM -f '${REMOTE_DEPLOY_TOKEN}' 2>/dev/null || true" || true
}

handle_interrupt() {
  trap - INT TERM
  cleanup_remote_deploy
  exit 130
}

trap handle_interrupt INT TERM

write_remote_env() {
  local app_key
  app_key="$(
    remote_exec "if [ -f '${REMOTE_PATH}/backend/.env' ]; then awk -F= '/^APP_KEY=/ {print substr(\$0, 9); exit}' '${REMOTE_PATH}/backend/.env'; fi" \
      2>/dev/null || true
  )"
  if [[ -z "${app_key}" ]]; then
    app_key="$(LC_ALL=C tr -dc 'A-Za-z0-9_-' </dev/urandom | head -c 64)"
  fi

  ssh "${SSH_OPTS[@]}" "${REMOTE}" "cat > '${REMOTE_PATH}/backend/.env'" <<EOF
APP_ENV=${APP_ENV}
APP_KEY=${app_key}
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

  if ! remote_exec_tracked "${command}"; then
    log_warn "Remote Composer install failed once. Retrying..."
    remote_exec_tracked "${command}"
  fi
}

remote_root_status() {
  remote_exec "if [ -d '${REMOTE_PATH}' ] && [ \"\$(find '${REMOTE_PATH}' -mindepth 1 -maxdepth 1 | head -n 1)\" ]; then echo 'not_empty'; else echo 'empty'; fi"
}

remote_clear_root() {
  remote_exec_tracked "mkdir -p '${REMOTE_PATH}' && \
    if command -v chattr >/dev/null 2>&1; then \
      find '${REMOTE_PATH}' -name '.user.ini' -exec chattr -i {} + 2>/dev/null || true; \
    fi && \
    find '${REMOTE_PATH}' -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
}

remote_fix_permissions() {
  remote_exec_tracked "mkdir -p '${REMOTE_PATH}/backend/storage/exports' && \
    chmod 755 '${REMOTE_PATH}' '${REMOTE_PATH}/backend' '${REMOTE_PATH}/database' '${REMOTE_PATH}/font' && \
    if [ -d '${REMOTE_PATH}/backend/public' ]; then chmod 755 '${REMOTE_PATH}/backend/public'; fi && \
    if [ -f '${REMOTE_PATH}/backend/public/index.php' ]; then chmod 644 '${REMOTE_PATH}/backend/public/index.php'; fi && \
    chmod -R u=rwX,g=rwX,o=rx '${REMOTE_PATH}/backend/storage' && \
    if id -u www >/dev/null 2>&1; then \
      chown -R www:www '${REMOTE_PATH}/backend/storage' && \
      chown www:www '${REMOTE_PATH}/backend/.env' && \
      chmod 640 '${REMOTE_PATH}/backend/.env'; \
    else \
      chmod 644 '${REMOTE_PATH}/backend/.env'; \
    fi && \
    find '${REMOTE_PATH}/backend/bin' -maxdepth 1 -type f -name '*.php' -exec chmod 755 {} +"
}

build_frontend() {
  cd "${FRONTEND_DIR}"
  VITE_API_BASE_URL="${VITE_API_BASE_URL}" yarn build
}

upload_frontend() {
  rsync -az --delete --info=stats2 --human-readable \
    -e "${RSYNC_SSH}" \
    --filter='P /backend/***' \
    --filter='P /database/***' \
    --filter='P /font/***' \
    --filter='P /.user.ini' \
    --filter='P /.well-known/***' \
    "${FRONTEND_DIR}/dist/" \
    "${REMOTE}:${REMOTE_PATH}/"
}

upload_fonts() {
  rsync -azc --delete --info=stats2 --human-readable \
    -e "${RSYNC_SSH}" \
    "${FONT_DIR}/" \
    "${REMOTE}:${REMOTE_PATH}/font/"
}

validate_backend() {
  cd "${BACKEND_DIR}"
  composer validate --strict
  composer check
  composer db:init:dry-run
}

inspect_remote_root() {
  local status
  status="$(remote_root_status)"
  log_info "Root status: ${status}"
}

calculate_total_steps() {
  local total=10
  if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
    total=$((total + 1))
  fi

  if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
    total=$((total + 4))
    if [[ "${SKIP_DB_INIT:-0}" == "1" ]]; then
      total=$((total - 1))
    fi
  elif [[ "${RUN_DB_MIGRATE}" == "1" && "${SKIP_DB_INIT:-0}" != "1" ]]; then
    total=$((total + 1))
  fi

  TOTAL_STEPS="${total}"
}

require_command ssh
require_command rsync
require_command composer
require_command yarn
CURRENT_STEP="preflight"

case "${DEPLOY_COMMAND}" in
  "")
    ;;
  "sync")
    DEPLOY_MODE="sync"
    ;;
  "migrate")
    DEPLOY_MODE="sync"
    RUN_DB_MIGRATE="1"
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

if [[ "${DEPLOY_MODE}" == "sync" && "${DEPLOY_COMMAND}" != "migrate" && "${RUN_DB_INIT:-0}" == "1" ]]; then
  echo "Refusing RUN_DB_INIT=1 during sync deploy." >&2
  echo "Use './deploy.sh migrate' for non-destructive database migrations, or './deploy.sh fresh' for a confirmed reset." >&2
  exit 1
fi

if [[ "${DEPLOY_MODE}" == "fresh" && "${CONFIRM_FRESH_DEPLOY}" != "${DOMAIN}" ]]; then
  echo "Fresh deploy is destructive. Re-run with:" >&2
  echo "  DEPLOY_MODE=fresh CONFIRM_FRESH_DEPLOY=${DOMAIN} ./deploy.sh" >&2
  exit 1
fi

calculate_total_steps
print_banner

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  run_step "Build frontend" build_frontend
else
  log_warn "Skipping frontend build because SKIP_BUILD=1"
fi

run_step "Validate backend" validate_backend

run_step "Inspect remote root" inspect_remote_root

if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
  run_step "Clear remote root" remote_clear_root
  RUN_DB_MIGRATE="0"
fi

run_step "Prepare remote directories" remote_exec_tracked "mkdir -p '${REMOTE_PATH}/backend' '${REMOTE_PATH}/database' '${REMOTE_PATH}/font' '${REMOTE_PATH}/backend/storage/exports'"

run_step "Upload frontend" upload_frontend

run_step "Upload backend" rsync -az --delete --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  --exclude '.env' \
  --exclude 'vendor/' \
  --exclude 'storage/' \
  "${BACKEND_DIR}/" \
  "${REMOTE}:${REMOTE_PATH}/backend/"

run_step "Upload database SQL" rsync -az --delete --info=stats2 --human-readable \
  -e "${RSYNC_SSH}" \
  "${DATABASE_DIR}/" \
  "${REMOTE}:${REMOTE_PATH}/database/"

run_step "Upload fonts" upload_fonts

run_step "Write backend environment" write_remote_env
run_step "Install backend dependencies" remote_composer_install
run_step "Fix remote permissions" remote_fix_permissions

if [[ "${DEPLOY_MODE}" == "fresh" ]]; then
  run_step "Preview database reset" remote_exec_tracked "cd '${REMOTE_PATH}/backend' && php bin/reset-database.php --dry-run"
  run_step "Reset database objects" remote_exec_tracked "cd '${REMOTE_PATH}/backend' && php bin/reset-database.php --yes"
fi

if [[ "${DEPLOY_MODE}" == "fresh" && "${SKIP_DB_INIT:-0}" != "1" ]]; then
  run_step "Initialize empty database" remote_exec_tracked "cd '${REMOTE_PATH}/backend' && php bin/init-database.php --yes"
elif [[ "${RUN_DB_MIGRATE}" == "1" && "${SKIP_DB_INIT:-0}" != "1" ]]; then
  run_step "Run non-destructive migrations" remote_exec_tracked "cd '${REMOTE_PATH}/backend' && php bin/init-database.php --yes --migrations-only"
else
  log_warn "Skipping database changes for sync deploy"
fi

cat <<EOF

${C_BOLD}Deploy summary${C_RESET}
${C_DIM}────────────────────────────────────────${C_RESET}

Domain:
  ${APP_URL}

Important web server rule:
  Route /api/* to ${REMOTE_PATH}/backend/public/index.php

This script never creates the MySQL database.
Sync mode does not reset the root path or database.
Fresh mode clears the remote root path and resets existing MySQL objects before initialization.

Deployment mode:
  ${DEPLOY_MODE}

Database migration:
  ${RUN_DB_MIGRATE}
EOF
