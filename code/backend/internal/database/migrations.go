package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"budgetcentre/backend/internal/config"
)

func Bootstrap(ctx context.Context, db *sql.DB, cfg config.Config, logger *slog.Logger) error {
	unlock, err := advisoryLock(ctx, db)
	if err != nil {
		return err
	}
	defer unlock()

	if err := ensureMigrationTable(ctx, db); err != nil {
		return err
	}

	files, err := migrationFiles(cfg.DatabaseDir)
	if err != nil {
		return err
	}

	coreReady, err := coreTablesExist(ctx, db)
	if err != nil {
		return err
	}
	if !coreReady {
		logger.Info("empty database detected, running full initialization")
		for _, file := range files {
			if err := applyMigration(ctx, db, file); err != nil {
				return fmt.Errorf("%s: %w", file.Name, err)
			}
		}
		return nil
	}

	for _, file := range files {
		applied, err := migrationApplied(ctx, db, file)
		if err != nil {
			return err
		}
		if applied {
			continue
		}
		logger.Info("applying pending migration", "file", file.Name)
		if err := applyMigration(ctx, db, file); err != nil {
			return fmt.Errorf("%s: %w", file.Name, err)
		}
	}
	return nil
}

func Status(ctx context.Context, db *sql.DB, cfg config.Config) (MigrationStatus, error) {
	status := MigrationStatus{Connected: true, Database: cfg.DBName}
	if err := ensureMigrationTable(ctx, db); err != nil {
		return status, err
	}
	coreReady, err := coreTablesExist(ctx, db)
	if err != nil {
		return status, err
	}
	status.CoreReady = coreReady
	files, err := migrationFiles(cfg.DatabaseDir)
	if err != nil {
		return status, err
	}
	appliedRows, err := appliedMigrations(ctx, db)
	if err != nil {
		return status, err
	}
	appliedByVersion := map[string]AppliedMigration{}
	for _, row := range appliedRows {
		status.Applied = append(status.Applied, row)
		appliedByVersion[row.Version] = row
	}
	for _, file := range files {
		if _, ok := appliedByVersion[file.Version]; !ok {
			status.Pending = append(status.Pending, PendingMigration{
				Version:  file.Version,
				Filename: file.Name,
				Checksum: file.Checksum,
			})
		}
	}
	return status, nil
}

func DryRun(ctx context.Context, db *sql.DB, cfg config.Config) ([]PendingMigration, error) {
	status, err := Status(ctx, db, cfg)
	if err != nil {
		return nil, err
	}
	return status.Pending, nil
}

func advisoryLock(ctx context.Context, db *sql.DB) (func(), error) {
	var acquired int
	if err := db.QueryRowContext(ctx, "SELECT GET_LOCK('budgetcentre_schema_migration', 30)").Scan(&acquired); err != nil {
		return nil, err
	}
	if acquired != 1 {
		return nil, errors.New("could not acquire schema migration lock")
	}
	return func() {
		_, _ = db.ExecContext(context.Background(), "SELECT RELEASE_LOCK('budgetcentre_schema_migration')")
	}, nil
}

func ensureMigrationTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	return err
}

func coreTablesExist(ctx context.Context, db *sql.DB) (bool, error) {
	var count int
	err := db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('users', 'currencies', 'budgets', 'budget_templates')`).Scan(&count)
	return count == 4, err
}

func migrationApplied(ctx context.Context, db *sql.DB, file migrationFile) (bool, error) {
	var checksum string
	err := db.QueryRowContext(ctx, "SELECT checksum FROM schema_migrations WHERE version = ?", file.Version).Scan(&checksum)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if checksum != file.Checksum {
		return false, fmt.Errorf("migration checksum changed for %s", file.Name)
	}
	return true, nil
}

func appliedMigrations(ctx context.Context, db *sql.DB) ([]AppliedMigration, error) {
	rows, err := db.QueryContext(ctx, "SELECT version, filename, checksum, applied_at FROM schema_migrations ORDER BY version")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AppliedMigration
	for rows.Next() {
		var row AppliedMigration
		var appliedAt time.Time
		if err := rows.Scan(&row.Version, &row.Filename, &row.Checksum, &appliedAt); err != nil {
			return nil, err
		}
		row.AppliedAt = appliedAt.Format(time.RFC3339)
		out = append(out, row)
	}
	return out, rows.Err()
}
