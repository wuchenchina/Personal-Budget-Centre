# BudgetCentre

[English](README.md) | [简体中文](README_cn.md)

BudgetCentre is a personal and shared budget workspace built with React,
TypeScript, Ant Design, and a Go API. It supports budget projects, workspace
roles, passkeys, SSO, exchange rates, bookkeeping records, and PDF exports.

## Stack

- Frontend: Vite, React, TypeScript, Ant Design
- Backend: Go HTTP API
- PDF renderer: .NET worker
- Database: MySQL, initialized and migrated from `code/database`
- Runtime: Docker Compose with Nginx, Go API, and PDF renderer containers

## Repository Layout

```text
.
  code/
    frontend/             Vite + React application
    backend/              Go API
    database/             schema, seed, view, and migration SQL
    deploy/docker/        Nginx config for Docker
    font/                 local PDF font assets, ignored except README.md
    pdf-renderer-dotnet/  .NET PDF renderer worker
  local-only/             ignored local imports, legacy source, private deploy env
  Dockerfile
  docker-compose.yaml
  deploy.example.sh       public deployment template
  .env.example            application environment template
```

## Local Development

Create an environment file from the template:

```bash
cp .env.example .env
```

Install and build the frontend:

```bash
cd code/frontend
yarn install --frozen-lockfile
yarn build
```

Run backend tests:

```bash
cd code/backend
go test ./...
```

Build the PDF renderer:

```bash
dotnet build code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj
```

Run the API locally:

```bash
cd code/backend
go run ./cmd/api
```

The first successfully registered user becomes an admin. If an existing
database has no admin user, set `users.is_admin = 1` manually.

## Configuration

Runtime configuration is read from `.env`. Keep real secrets out of git.

Important values:

- `APP_KEY`: required for secure token and SSO flows.
- `APP_URL` and `API_URL`: public frontend/API origins.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL connection.
- `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN`: must match the deployed domain.
- `CASDOOR_*`: optional Axchen/Casdoor SSO configuration.
- `LINUX_DO_*`: optional Linux Do OAuth/OIDC SSO configuration. The callback
  endpoint is shared with other SSO providers at `/api/callback`; set each
  provider's redirect URI to your public API origin plus `/api/callback`.
- `SMTP_*`: optional mail configuration.
- `WEB_BIND`: host bind for the web container, default `127.0.0.1:18080`.
- `BANK_REFERENCE_RATES_URL`: optional private reference-rate endpoint. Leave
  blank for open-source/default deployments.
- `PDF_RENDERER_*` and `PDF_EXPORT_*`: worker concurrency and export cleanup
  controls.

## PDF Fonts

PDF export expects local font files under `code/font`. Font binaries are ignored
because many system fonts are not redistributable. See
`code/font/README.md` for the filenames expected by the current PDF themes.

The .NET PDF renderer build does not embed fonts into the application binary.
In Docker Compose, `./code/font` is mounted into the renderer container as
`/app/font:ro`, and `FONT_DIR` points there. Make sure the required font files
exist on the server before running `docker compose up -d`.

## Docker

Build and start the application:

```bash
docker compose build
docker compose up -d
```

The web service binds to `WEB_BIND`, which defaults to:

```text
127.0.0.1:18080
```

The API stores generated files, temporary files, and logs under:

```text
storage/exports
storage/tmp
storage/logs
```

## Database

MySQL is expected to run outside Docker. The Go API performs safe bootstrap on
startup:

- Empty database: applies `code/database/*.sql` as the clean current schema.
- Existing database: creates or updates `schema_migrations`, reconciles known
  pre-1.0 internal migration filename/checksum drift, then applies pending safe
  migrations.
- Legacy provider metadata is neutralized by migrations; real provider URLs
  should live only in private environment variables.

The application does not provide a destructive reset/drop/truncate flow.

## Deployment

`deploy.example.sh` is a public template. Copy it to a private local script:

```bash
cp deploy.example.sh deploy.local.sh
chmod +x deploy.local.sh
```

You can either edit `deploy.local.sh`, export variables before running it, or
put private values in an ignored file:

```bash
mkdir -p local-only
$EDITOR local-only/deploy.local.env
```

Example `local-only/deploy.local.env`:

```bash
SERVER_USER="${SERVER_USER:-root}"
SERVER_IP="${SERVER_IP:-203.0.113.10}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_SSH_KEY="${SERVER_SSH_KEY:-/path/to/id_ed25519}"
REMOTE_PATH="${REMOTE_PATH:-/opt/budgetcentre}"
DOMAIN="${DOMAIN:-budget.example.com}"

DB_HOST="${DB_HOST:-172.17.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-budgetcentre}"
DB_USER="${DB_USER:-budgetcentre}"
DB_PASSWORD="${DB_PASSWORD:-change-me}"
APP_KEY="${APP_KEY:-change-me-long-random-secret}"

CASDOOR_SERVER_URL="${CASDOOR_SERVER_URL:-}"
CASDOOR_DISPLAY_NAME="${CASDOOR_DISPLAY_NAME:-Axchen SSO}"
CASDOOR_CLIENT_ID="${CASDOOR_CLIENT_ID:-}"
CASDOOR_REDIRECT_URI="${CASDOOR_REDIRECT_URI:-${API_URL%/}/api/callback}"
CASDOOR_CLIENT_SECRET="${CASDOOR_CLIENT_SECRET:-}"
LINUX_DO_CLIENT_ID="${LINUX_DO_CLIENT_ID:-}"
LINUX_DO_CLIENT_SECRET="${LINUX_DO_CLIENT_SECRET:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_USERNAME="${SMTP_USERNAME:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"

BUILD_PROXY="${BUILD_PROXY:-}"
```

Run deploy, optionally with a build proxy:

```bash
BUILD_PROXY=http://10.0.0.1:7890 ./deploy.local.sh
```

The proxy is passed to frontend, Go API, and .NET PDF renderer Docker builds.
The renderer's `dotnet restore` downloads NuGet packages during the Docker
build; the first build may still take a while, but later builds reuse Docker
layer cache while the `.csproj` stays unchanged.

The deployment script:

- runs `yarn build` for the frontend,
- copies frontend assets into `build/deploy/frontend`,
- runs `go test ./...`,
- runs `.NET PDF renderer` build,
- cross-compiles the Go API into `build/deploy/backend/budgetcentre-api`,
- uploads only the release allowlist,
- writes the remote `.env`,
- shows rsync progress and changed files with
  `rsync -avz --progress --itemize-changes`,
- prunes old local/test resources on the remote release directory, such as
  legacy PHP source, visual PDF fixtures, preview-check folders, dumps, and
  local-only files.

It does not start Docker, restart services, or modify the database. After upload,
run on the server:

```bash
cd /path/to/budgetcentre
docker compose build
docker compose up -d
```

After `docker compose up -d`, the Go API startup performs database bootstrap and
pending migrations. Deploy scripts intentionally do not run SQL.

## Local-Only Data

Use `local-only/` for imported dumps, legacy source snapshots, server scratch
files, and private deployment env files. This directory is ignored by git,
excluded from Docker build context, and excluded from rsync deployment.

Runtime and generated files stay under `storage/`, which is also ignored and
not uploaded by deploy scripts.

## Verification

Before publishing or deploying a release, run:

```bash
cd code/backend && go test ./...
cd ../../code/frontend && yarn build
cd ../.. && dotnet build code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer/BudgetCentre.PdfRenderer.csproj
bash -n deploy.local.sh deploy.example.sh
```

For database-sensitive releases, also test an empty database and a legacy dump:

- Empty database initializes successfully.
- Existing database migrates through all pending migrations.
- Core user/workspace/budget/bookkeeping row counts do not decrease.
- Public artifacts do not contain private provider URLs or deployment secrets.

## Git Hygiene

This repository is intended to be open-source friendly. Do not commit:

- `.env*` files, except `.env.example`
- `deploy.local.sh` or other private deployment scripts
- `local-only/`
- `BudgetCentre_old/`, `template/`, `parsed_templates/`
- `docs/` and AI/agent working files
- `build/`, `dist/`, `node_modules/`, `vendor/`, `storage/`
- local font binaries in `code/font`
- caches such as `__pycache__`, logs, and OS/editor metadata
