# BudgetCentre Go Backend

Go API for BudgetCentre. The service runs schema bootstrap on startup:

- empty database: runs `code/database/*.sql`
- existing database: records/applies pending safe migrations
- destructive reset/fresh operations are not provided

Run locally:

```bash
go test ./...
go run ./cmd/api
```

Configuration is read from process environment plus `.env`, `../.env`, or `../../.env`, so both backend-local and project-root Compose `.env` files work.

The API keeps the existing `/api/*` JSON envelope and cookie/CSRF contract.
