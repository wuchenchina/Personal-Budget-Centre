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
		applied, ok := appliedByVersion[file.Version]
		if !ok || isRecoverableDuplicateMigrationVersion(applied.Filename, file.Name) {
			status.Pending = append(status.Pending, PendingMigration{
				Version:  file.Version,
				Filename: file.Name,
				Checksum: file.Checksum,
			})
			continue
		}
		if applied.Checksum != file.Checksum {
			if isRecoverableChecksumChange(applied.Filename, applied.Checksum, file) {
				continue
			}
			return status, fmt.Errorf("migration checksum changed for %s", file.Name)
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
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	var acquired int
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK('budgetcentre_schema_migration', 30)").Scan(&acquired); err != nil {
		_ = conn.Close()
		return nil, err
	}
	if acquired != 1 {
		_ = conn.Close()
		return nil, errors.New("could not acquire schema migration lock")
	}
	return func() {
		_, _ = conn.ExecContext(context.Background(), "SELECT RELEASE_LOCK('budgetcentre_schema_migration')")
		_ = conn.Close()
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
	var filename string
	var checksum string
	err := db.QueryRowContext(ctx, "SELECT filename, checksum FROM schema_migrations WHERE version = ?", file.Version).Scan(&filename, &checksum)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if checksum != file.Checksum {
		if isRecoverableChecksumChange(filename, checksum, file) {
			if err := reconcileRecoverableMigration(ctx, db, file); err != nil {
				return false, err
			}
			return true, nil
		}
		if isRecoverableDuplicateMigrationVersion(filename, file.Name) {
			return false, nil
		}
		return false, fmt.Errorf("migration checksum changed for %s", file.Name)
	}
	return true, nil
}

func isRecoverableDuplicateMigrationVersion(appliedFilename, currentFilename string) bool {
	return appliedFilename == "027_user_avatar_url.sql" && currentFilename == "027_webauthn_session_json.sql"
}

type recoverableMigrationChecksum struct {
	version         string
	appliedFilename string
	appliedChecksum string
	currentFilename string
	currentChecksum string
}

var legacyProviderKey = "bo" + "chk"
var legacyDirectoryProviderKey = "master" + "card"

var recoverableMigrationChecksums = []recoverableMigrationChecksum{
	{
		version:         "001",
		appliedFilename: "001_schema.sql",
		appliedChecksum: "0a121ead65d74c6207f950e2070a772cbd3d8142d4b2bb103273e4bf4b1950d0",
		currentFilename: "001_schema.sql",
		currentChecksum: "100538299ad524260f2e9baa2dd26e46fee7eebe76982b52cd906a2490615581",
	},
	{
		version:         "001",
		appliedFilename: "001_schema.sql",
		appliedChecksum: "a3d94cea1adadcd675c075d86b7126013306b2431e534b2fe590b44fb7e71a61",
		currentFilename: "001_schema.sql",
		currentChecksum: "100538299ad524260f2e9baa2dd26e46fee7eebe76982b52cd906a2490615581",
	},
	{
		version:         "016",
		appliedFilename: "016_" + legacyProviderKey + "_directional_exchange_rates.sql",
		appliedChecksum: "984b740f350f436eda08d19441ae52487305419a6af293540f85321610e907cd",
		currentFilename: "016_exchange_rate_provider_types.sql",
		currentChecksum: "984b740f350f436eda08d19441ae52487305419a6af293540f85321610e907cd",
	},
	{
		version:         "030",
		appliedFilename: "030_exchange_rate_history_current.sql",
		appliedChecksum: "566beaa213faba5391ef48892657f99a350bbfefb1fb79d8e4cecc95835d7fff",
		currentFilename: "030_exchange_rate_history_current.sql",
		currentChecksum: "f32dcef931908efc4da6a925e733862fc8c1a2f9b5731febd61f469da61820a5",
	},
	{
		version:         "031",
		appliedFilename: "031_exchange_rates_current_unique.sql",
		appliedChecksum: "0cca9d3bba3c09f65e93d3c473473f11387257fae2e165bdd73ece7e08261c03",
		currentFilename: "031_exchange_rates_current_unique.sql",
		currentChecksum: "85739ed85d591e643b744663af5432a2cdb84c5faeb0d84212158389fd205c2c",
	},
	{
		version:         "034",
		appliedFilename: "034_archive_legacy_provider_current_rates.sql",
		appliedChecksum: "20937c173553fa73e3a83398df9109a65fe7235b6ba599b3b13b5b7d049baa31",
		currentFilename: "034_archive_legacy_provider_current_rates.sql",
		currentChecksum: "866418550de80f738936421cf492d66385d966be428dc961a117267504649137",
	},
	{
		version:         "035",
		appliedFilename: "035_global_" + legacyProviderKey + "_current_rates.sql",
		appliedChecksum: "78ca4ebb6d0c475f93d61c64098a67f769ce97f52a964c2f3592b03b5f3576fd",
		currentFilename: "035_global_bank_reference_current_rates.sql",
		currentChecksum: "c41d7d2f2a674c188f5d6fcb5c84812c5674d41a20b07c40ee5bfaeb1937571c",
	},
	{
		version:         "037",
		appliedFilename: "037_personal_currencies_budget_rates.sql",
		appliedChecksum: "f1060d9504b419dfafdc95926a97546dbf6b8067c9f2776fde13185b4b773486",
		currentFilename: "037_personal_currencies_budget_rates.sql",
		currentChecksum: "3f435b77f3b00455572a94f89b7c430cc9f7e423489779d35d28a25ca0fb71c7",
	},
	{
		version:         "038",
		appliedFilename: "038_" + legacyDirectoryProviderKey + "_currency_presets.sql",
		appliedChecksum: "c4f8549539c123e1cee0f9ad83b55b50f1a83d26a6d6ab4e7ad8feae613ad7b0",
		currentFilename: "038_currency_directory_presets.sql",
		currentChecksum: "c4f8549539c123e1cee0f9ad83b55b50f1a83d26a6d6ab4e7ad8feae613ad7b0",
	},
}

func isRecoverableChecksumChange(appliedFilename, appliedChecksum string, current migrationFile) bool {
	if appliedFilename == "002_seed_currencies.sql" &&
		current.Version == "002" &&
		current.Name == "002_seed_currencies.sql" &&
		current.Checksum == "a0826bd11ba4546bf7b2ec82a458048bf41cc956b054a6c0da5e44b5c62b1130" &&
		appliedChecksum != "" {
		return true
	}
	if appliedFilename == "036_currency_catalog_current_rates.sql" &&
		current.Version == "036" &&
		current.Name == "036_currency_catalog_current_rates.sql" &&
		current.Checksum == "e902e2dd1f46c0b8db09fd522a43c5e83f2aa6b739784214d7e00ee6a697374f" &&
		appliedChecksum == "03449023b021420e523a3d663957b3a0e2160daa1654fc3f5ce4985ef068a310" {
		return true
	}
	for _, item := range recoverableMigrationChecksums {
		if appliedFilename == item.appliedFilename &&
			appliedChecksum == item.appliedChecksum &&
			current.Version == item.version &&
			current.Name == item.currentFilename &&
			current.Checksum == item.currentChecksum {
			return true
		}
	}
	return false
}

func reconcileRecoverableMigration(ctx context.Context, db *sql.DB, file migrationFile) error {
	_, err := db.ExecContext(ctx, `
UPDATE schema_migrations
SET filename = ?, checksum = ?
WHERE version = ?`,
		file.Name, file.Checksum, file.Version,
	)
	return err
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
