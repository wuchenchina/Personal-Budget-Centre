# BudgetCentre

BudgetCentre is a personal and shared budget workspace built with React,
TypeScript, Ant Design, and a Go API. It supports budget projects, workspace
roles, passkeys, SSO, exchange rates, bookkeeping records, and PDF exports.

## Stack

- Frontend: Vite, React, TypeScript, Ant Design
- Backend: Go HTTP API
- Database: MySQL, initialized and migrated from `code/database`
- Runtime: Docker Compose with an Nginx web container and a Go API container

## Repository Layout

```text
.
  code/
    frontend/             Vite + React application
    backend/              Go API
    database/             schema, seed, view, and migration SQL
    deploy/docker/        Nginx config for Docker
    font/                 local PDF font assets, ignored except README.md
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
- `CASDOOR_*`: optional Casdoor SSO configuration.
- `SMTP_*`: optional mail configuration.
- `WEB_BIND`: host bind for the web container, default `127.0.0.1:18080`.

## PDF Fonts

PDF export expects local font files under `code/font`. Font binaries are ignored
because many system fonts are not redistributable. See
`code/font/README.md` for the filenames expected by the current PDF themes.

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

- Empty database: applies `code/database/*.sql`.
- Existing database: creates or updates `schema_migrations`, then applies
  pending safe migrations.

The application does not provide a destructive reset/drop/truncate flow.

## Deployment

`deploy.example.sh` is a public template. Copy it to a private local script and
fill in your server, SSH, domain, database, SMTP, and SSO values:

```bash
cp deploy.example.sh deploy.local.sh
chmod +x deploy.local.sh
./deploy.local.sh
```

The deployment script:

- runs `yarn build` for the frontend,
- copies frontend assets into `build/deploy/frontend`,
- runs `go test ./...`,
- cross-compiles the Go API into `build/deploy/backend/budgetcentre-api`,
- uploads only the release allowlist,
- writes the remote `.env`.

It does not start Docker, restart services, or modify the database. After upload,
run on the server:

```bash
cd /path/to/budgetcentre
docker compose build
docker compose up -d
```

## Git Hygiene

This repository is intended to be open-source friendly. Do not commit:

- `.env*` files, except `.env.example`
- `deploy.local.sh` or other private deployment scripts
- `BudgetCentre_old/`, `template/`, `parsed_templates/`
- `docs/` and AI/agent working files
- `build/`, `dist/`, `node_modules/`, `vendor/`, `storage/`
- local font binaries in `code/font`
- caches such as `__pycache__`, logs, and OS/editor metadata
