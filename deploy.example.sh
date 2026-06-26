#!/usr/bin/env bash

set -Eeuo pipefail

# Copy this file to deploy.local.sh and fill in values for your own server.
# deploy.local.sh is ignored by git.

SERVER_USER="${SERVER_USER:-root}"
SERVER_IP="${SERVER_IP:-}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_SSH_KEY="${SERVER_SSH_KEY:-}"
SSH_BATCH_MODE="${SSH_BATCH_MODE:-yes}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-15}"
SSH_SERVER_ALIVE_INTERVAL="${SSH_SERVER_ALIVE_INTERVAL:-30}"
SSH_SERVER_ALIVE_COUNT_MAX="${SSH_SERVER_ALIVE_COUNT_MAX:-4}"
REMOTE_PATH="${REMOTE_PATH:-}"
DOMAIN="${DOMAIN:-}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${SERVER_USER}@${SERVER_IP}"
SSH_OPTS=(
  -i "${SERVER_SSH_KEY}"
  -p "${SERVER_PORT}"
  -o IdentitiesOnly=yes
  -o "BatchMode=${SSH_BATCH_MODE}"
  -o "ConnectTimeout=${SSH_CONNECT_TIMEOUT}"
  -o "ServerAliveInterval=${SSH_SERVER_ALIVE_INTERVAL}"
  -o "ServerAliveCountMax=${SSH_SERVER_ALIVE_COUNT_MAX}"
  -o StrictHostKeyChecking=accept-new
)

APP_ENV="${APP_ENV:-production}"
APP_URL="${APP_URL:-https://${DOMAIN}}"
API_URL="${API_URL:-https://${DOMAIN}}"
DB_HOST="${DB_HOST:-172.17.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
APP_KEY="${APP_KEY:-}"
SESSION_COOKIE="${SESSION_COOKIE:-budgetcentre_session}"
CSRF_COOKIE="${CSRF_COOKIE:-budgetcentre_csrf}"
WEBAUTHN_RP_ID="${WEBAUTHN_RP_ID:-${DOMAIN}}"
WEBAUTHN_RP_NAME="${WEBAUTHN_RP_NAME:-BudgetCentre}"
WEBAUTHN_ORIGIN="${WEBAUTHN_ORIGIN:-https://${DOMAIN}}"
CASDOOR_SERVER_URL="${CASDOOR_SERVER_URL:-}"
CASDOOR_CLIENT_ID="${CASDOOR_CLIENT_ID:-}"
CASDOOR_REDIRECT_URI="${CASDOOR_REDIRECT_URI:-https://${DOMAIN}/api/callback}"
CASDOOR_CLIENT_SECRET="${CASDOOR_CLIENT_SECRET:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_USERNAME="${SMTP_USERNAME:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
MAIL_FROM="${MAIL_FROM:-${SMTP_USERNAME}}"
MAIL_FROM_NAME="${MAIL_FROM_NAME:-BudgetCentre}"
WEB_BIND="${WEB_BIND:-127.0.0.1:18080}"
APP_STORAGE_ROOT="${APP_STORAGE_ROOT:-./storage}"
BUILD_PROXY="${BUILD_PROXY:-}"
BUILD_HTTP_PROXY="${BUILD_HTTP_PROXY:-}"
BUILD_HTTPS_PROXY="${BUILD_HTTPS_PROXY:-}"
BUILD_ALL_PROXY="${BUILD_ALL_PROXY:-}"
BUILD_NO_PROXY="${BUILD_NO_PROXY:-localhost,127.0.0.1,::1}"
WEB_BUILD_TARGET="${WEB_BUILD_TARGET:-web-prebuilt}"
API_BUILD_TARGET="${API_BUILD_TARGET:-api-prebuilt}"
BACKEND_GOOS="${BACKEND_GOOS:-linux}"
BACKEND_GOARCH="${BACKEND_GOARCH:-amd64}"
BACKEND_CGO_ENABLED="${BACKEND_CGO_ENABLED:-0}"
BACKEND_LDFLAGS="${BACKEND_LDFLAGS:--s -w}"
DEPLOY_TMP_ENV=""
LOCAL_BUILD_ROOT="${PROJECT_ROOT:-}/build/deploy"
FRONTEND_ARTIFACT_DIR="${LOCAL_BUILD_ROOT}/frontend"
BACKEND_ARTIFACT_DIR="${LOCAL_BUILD_ROOT}/backend"
BACKEND_ARTIFACT_BINARY="${BACKEND_ARTIFACT_DIR}/budgetcentre-api"

DEPLOY_ROOT_FILES=(
  ".dockerignore"
  ".env.example"
  "Dockerfile"
  "README.md"
  "docker-compose.yaml"
)

DEPLOY_DIRS=(
  "build/deploy"
  "code/backend"
  "code/database"
  "code/deploy"
  "code/font"
  "code/frontend"
)

DEPLOY_MANUAL_FILES=(
  "scripts/legacy_currency_audit.sql"
  "scripts/legacy_currency_cleanup.sql"
)

DEPLOY_REMOTE_PRUNE_PATHS=(
  ".agents"
  ".claude"
  ".gitignore"
  "AGENTS.md"
  "build/deploy"
  "code/README.md"
  "code/backend-php-legacy"
  "code/backend/api"
  "code/frontend/dist"
  "code/frontend/node_modules"
  "docs"
  "parsed_templates"
  "scripts"
  "template"
)

RSYNC_RELEASE_EXCLUDES=(
  "--exclude=.DS_Store"
  "--exclude=*.log"
  "--exclude=__pycache__/"
  "--exclude=*.pyc"
  "--exclude=node_modules/"
  "--exclude=dist/"
  "--exclude=vendor/"
  "--exclude=coverage/"
  "--exclude=tmp/"
  "--exclude=.env"
  "--exclude=.env.local"
  "--exclude=.env.development"
  "--exclude=.env.production"
  "--exclude=.env.test"
  "--exclude=deploy.local.sh"
  "--exclude=/code/backend/api"
  "--exclude=/code/backend/*.test"
  "--exclude=/code/backend/coverage.out"
)

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_value() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "${key} is required. Copy deploy.example.sh to deploy.local.sh and fill it in, or export ${key}." >&2
    exit 1
  fi
}

remote_quote() {
  local value="$1"
  printf "'%s'" "${value//\'/\'\\\'\'}"
}

rsync_ssh_command() {
  local command
  command="$(printf '%q ' ssh "${SSH_OPTS[@]}")"
  printf '%s' "${command% }"
}

run_remote() {
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "$@"
}

check_deploy_config() {
  require_value SERVER_IP "${SERVER_IP}"
  require_value SERVER_SSH_KEY "${SERVER_SSH_KEY}"
  require_value REMOTE_PATH "${REMOTE_PATH}"
  require_value DOMAIN "${DOMAIN}"
  require_value DB_NAME "${DB_NAME}"
  require_value DB_USER "${DB_USER}"
  require_value DB_PASSWORD "${DB_PASSWORD}"
  require_value APP_KEY "${APP_KEY}"

  if [[ ! "${SERVER_PORT}" =~ ^[0-9]+$ ]]; then
    echo "SERVER_PORT must be numeric: ${SERVER_PORT}" >&2
    exit 1
  fi

  if [[ ! -r "${SERVER_SSH_KEY}" ]]; then
    echo "SSH key is not readable: ${SERVER_SSH_KEY}" >&2
    exit 1
  fi
}

check_remote_access() {
  local remote_path
  remote_path="$(remote_quote "${REMOTE_PATH}")"

  echo "Checking SSH access to ${REMOTE}..."
  if ! run_remote "command -v rsync >/dev/null 2>&1 && mkdir -p ${remote_path}"; then
    cat >&2 <<EOF
Unable to prepare ${REMOTE}:${REMOTE_PATH}.
The SSH session was closed before rsync could start, or rsync is missing on the server.

Check manually:
  ssh -i "${SERVER_SSH_KEY}" -p "${SERVER_PORT}" -o IdentitiesOnly=yes "${REMOTE}" "command -v rsync && mkdir -p ${remote_path}"
EOF
    exit 1
  fi
}

write_env() {
  local target="$1"
  prepare_build_proxy_env
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
    env_line BUILD_HTTP_PROXY "${BUILD_HTTP_PROXY}"
    env_line BUILD_HTTPS_PROXY "${BUILD_HTTPS_PROXY}"
    env_line BUILD_ALL_PROXY "${BUILD_ALL_PROXY}"
    env_line BUILD_NO_PROXY "${BUILD_NO_PROXY}"
    env_line WEB_BUILD_TARGET "${WEB_BUILD_TARGET}"
    env_line API_BUILD_TARGET "${API_BUILD_TARGET}"
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

cleanup_tmp_env() {
  if [[ -n "${DEPLOY_TMP_ENV:-}" && -f "${DEPLOY_TMP_ENV}" ]]; then
    rm -f "${DEPLOY_TMP_ENV}"
  fi
}

normalize_proxy_url() {
  local proxy="$1"
  if [[ -z "${proxy}" ]]; then
    printf ''
    return
  fi
  if [[ "${proxy}" == sock5://* ]]; then
    proxy="socks5://${proxy#sock5://}"
  fi
  if [[ "${proxy}" != *"://"* ]]; then
    proxy="http://${proxy}"
  fi
  printf '%s' "${proxy}"
}

prepare_build_proxy_env() {
  local proxy
  proxy="$(normalize_proxy_url "${BUILD_PROXY}")"
  if [[ -n "${proxy}" ]]; then
    BUILD_HTTP_PROXY="${BUILD_HTTP_PROXY:-${proxy}}"
    BUILD_HTTPS_PROXY="${BUILD_HTTPS_PROXY:-${proxy}}"
    BUILD_ALL_PROXY="${BUILD_ALL_PROXY:-${proxy}}"
  else
    BUILD_HTTP_PROXY="$(normalize_proxy_url "${BUILD_HTTP_PROXY}")"
    BUILD_HTTPS_PROXY="$(normalize_proxy_url "${BUILD_HTTPS_PROXY}")"
    BUILD_ALL_PROXY="$(normalize_proxy_url "${BUILD_ALL_PROXY}")"
  fi
}

require_release_file() {
  local rel="$1"
  if [[ ! -f "${PROJECT_ROOT}/${rel}" ]]; then
    echo "Missing deploy file: ${rel}" >&2
    exit 1
  fi
}

require_release_dir() {
  local rel="$1"
  if [[ ! -d "${PROJECT_ROOT}/${rel}" ]]; then
    echo "Missing deploy directory: ${rel}" >&2
    exit 1
  fi
}

sync_release_allowlist() {
  local rel
  local -a sources=()

  for rel in "${DEPLOY_ROOT_FILES[@]}"; do
    require_release_file "${rel}"
    sources+=("${PROJECT_ROOT}/./${rel}")
  done
  for rel in "${DEPLOY_DIRS[@]}"; do
    require_release_dir "${rel}"
    sources+=("${PROJECT_ROOT}/./${rel}/")
  done
  for rel in "${DEPLOY_MANUAL_FILES[@]}"; do
    require_release_file "${rel}"
    sources+=("${PROJECT_ROOT}/./${rel}")
  done

  rsync -az --delete --delete-excluded --relative \
    "${RSYNC_RELEASE_EXCLUDES[@]}" \
    -e "$(rsync_ssh_command)" \
    "${sources[@]}" "${REMOTE}:${REMOTE_PATH}/"
}

sync_env_file() {
  rsync -az -e "$(rsync_ssh_command)" "${DEPLOY_TMP_ENV}" "${REMOTE}:${REMOTE_PATH}/.env"
}

prepare_local_artifacts() {
  LOCAL_BUILD_ROOT="${PROJECT_ROOT}/build/deploy"
  FRONTEND_ARTIFACT_DIR="${LOCAL_BUILD_ROOT}/frontend"
  BACKEND_ARTIFACT_DIR="${LOCAL_BUILD_ROOT}/backend"
  BACKEND_ARTIFACT_BINARY="${BACKEND_ARTIFACT_DIR}/budgetcentre-api"

  echo "Building frontend locally..."
  (cd "${PROJECT_ROOT}/code/frontend" && yarn install --frozen-lockfile && yarn build)

  echo "Packaging frontend artifact..."
  rm -rf "${FRONTEND_ARTIFACT_DIR}"
  mkdir -p "${FRONTEND_ARTIFACT_DIR}"
  rsync -a --delete "${PROJECT_ROOT}/code/frontend/dist/" "${FRONTEND_ARTIFACT_DIR}/"

  echo "Verifying Go backend locally..."
  (cd "${PROJECT_ROOT}/code/backend" && go test ./...)

  echo "Building backend Linux artifact locally (${BACKEND_GOOS}/${BACKEND_GOARCH})..."
  rm -rf "${BACKEND_ARTIFACT_DIR}"
  mkdir -p "${BACKEND_ARTIFACT_DIR}"
  (
    cd "${PROJECT_ROOT}/code/backend"
    GOOS="${BACKEND_GOOS}" \
      GOARCH="${BACKEND_GOARCH}" \
      CGO_ENABLED="${BACKEND_CGO_ENABLED}" \
      go build -trimpath -ldflags "${BACKEND_LDFLAGS}" -o "${BACKEND_ARTIFACT_BINARY}" ./cmd/api
  )
  chmod +x "${BACKEND_ARTIFACT_BINARY}"

  if command -v file >/dev/null 2>&1; then
    file "${BACKEND_ARTIFACT_BINARY}"
  fi
}

prune_remote_release() {
  local remote_path
  remote_path="$(remote_quote "${REMOTE_PATH}")"
  local command="mkdir -p ${remote_path} && cd ${remote_path}"
  local rel
  for rel in "${DEPLOY_REMOTE_PRUNE_PATHS[@]}"; do
    command="${command} && rm -rf -- $(remote_quote "${rel}")"
  done
  run_remote "${command}"
}

main() {
  trap cleanup_tmp_env EXIT

  require_command ssh
  require_command rsync
  require_command yarn
  require_command go
  check_deploy_config
  check_remote_access

  prepare_local_artifacts

  DEPLOY_TMP_ENV="$(mktemp)"
  write_env "${DEPLOY_TMP_ENV}"

  echo "Preparing remote release directory at ${REMOTE}:${REMOTE_PATH}..."
  prune_remote_release

  echo "Uploading release allowlist to ${REMOTE}:${REMOTE_PATH}..."
  sync_release_allowlist
  sync_env_file
  run_remote "mkdir -p $(remote_quote "${REMOTE_PATH}/storage/exports") $(remote_quote "${REMOTE_PATH}/storage/tmp") $(remote_quote "${REMOTE_PATH}/storage/logs") && chmod 600 $(remote_quote "${REMOTE_PATH}/.env")"

  cat <<EOF

Upload complete.
Local frontend/backend prebuild artifacts were uploaded.
No Docker or database management was performed.

On the server, run manually when ready:
  cd ${REMOTE_PATH}
  docker compose build
  docker compose up -d

Reverse proxy target:
  http://${WEB_BIND}
EOF
}

main "$@"
