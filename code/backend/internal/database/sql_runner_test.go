package database

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestValidateSQLSafetyAllowsSafeMigrations(t *testing.T) {
	cases := []string{
		"ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL AFTER display_name;",
		"ALTER TABLE budget_items ADD KEY idx_budget_items_budget_sort (budget_id, sort_order, id);",
		"ALTER TABLE budgets MODIFY start_date DATE NULL, MODIFY end_date DATE NULL;",
		"SET @sql := 'ALTER TABLE budget_item_splits MODIFY split_type ENUM(''equal'', ''individual'') NOT NULL DEFAULT ''equal''';",
	}
	for _, sql := range cases {
		if err := validateSQLSafety(sql, "safe.sql"); err != nil {
			t.Fatalf("expected SQL to be allowed: %v", err)
		}
	}
}

func TestValidateSQLSafetyBlocksDangerousStatements(t *testing.T) {
	cases := []string{
		"DROP TABLE users;",
		"TRUNCATE audit_logs;",
		"ALTER TABLE users DROP COLUMN email;",
		"ALTER TABLE users RENAME COLUMN email TO old_email;",
		"ALTER TABLE users CHANGE email login VARCHAR(255);",
		"ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4;",
		"ALTER TABLE users ENGINE=InnoDB;",
		"ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;",
	}
	for _, sql := range cases {
		if err := validateSQLSafety(sql, "danger.sql"); err == nil {
			t.Fatalf("expected SQL to be blocked: %s", sql)
		}
	}
}

func TestMigrationFilesValidate(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "database")
	files, err := migrationFiles(dir)
	if err != nil {
		t.Fatalf("expected migration files to validate: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("expected at least one migration file")
	}
}

func TestExchangeRateHistoryMigrationsCoerceLegacySources(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "database")
	for _, name := range []string{"030_exchange_rate_history_current.sql", "031_exchange_rates_current_unique.sql"} {
		t.Run(name, func(t *testing.T) {
			content, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				t.Fatal(err)
			}
			sql := string(content)
			if !strings.Contains(sql, "WHEN er.source IN ('manual', 'budget_default', 'bochk') THEN er.source") {
				t.Fatalf("%s must whitelist supported exchange-rate sources before inserting history", name)
			}
			if !strings.Contains(sql, "ELSE 'manual'") {
				t.Fatalf("%s must coerce legacy unknown exchange-rate sources to manual", name)
			}
		})
	}
}

func TestSeedCurrenciesDoesNotPreloadCurrencyCatalog(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "database", "002_seed_currencies.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	codes := currencyCodesFromSeedSQL(sql)
	if len(codes) != 0 {
		t.Fatalf("seed migration must not preload currencies, got=%v", codes)
	}
}

func currencyCodesFromSeedSQL(sql string) []string {
	pattern := regexp.MustCompile(`\('([A-Z]{3})',`)
	matches := pattern.FindAllStringSubmatch(sql, -1)
	codes := make([]string, 0, len(matches))
	for _, match := range matches {
		codes = append(codes, match[1])
	}
	sort.Strings(codes)
	return codes
}

func TestLegacyProviderCurrentRatesAreArchivedAndRemoved(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "database", "034_archive_legacy_provider_current_rates.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	for _, want := range []string{
		"INSERT INTO exchange_rate_history",
		"er.source NOT IN ('manual', 'budget_default', 'bochk')",
		"er.provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')",
		"DELETE FROM exchange_rates",
		"source NOT IN ('manual', 'budget_default', 'bochk')",
		"provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("legacy provider cleanup migration missing %q", want)
		}
	}
}

func TestCurrentExchangeRateMigrationDoesNotRequireGeneratedUniqueIndex(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "database", "031_exchange_rates_current_unique.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	for _, blocked := range []string{
		"workspace_scope_id",
		"GENERATED ALWAYS",
		"uq_exchange_rates_current",
		"ADD UNIQUE KEY",
	} {
		if strings.Contains(sql, blocked) {
			t.Fatalf("031 migration must avoid generated unique index because it can rebuild legacy FK tables, found %q", blocked)
		}
	}
}

func TestGlobalBochkCurrentMigrationRemovesWorkspaceScopedProviderRows(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "database", "035_global_bochk_current_rates.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	for _, want := range []string{
		"WHERE er.source = 'bochk'",
		"AND er.workspace_id IS NOT NULL",
		"DELETE FROM exchange_rates",
		"WHERE source = 'bochk'",
		"AND workspace_id IS NOT NULL",
		"SET user_id = NULL",
		"AND workspace_id IS NULL",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("global BOCHK migration missing %q", want)
		}
	}
}

func TestCurrencyCatalogCurrentRatesMigrationDisablesHistoryAndKeepsLocalCatalog(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "database", "036_currency_catalog_current_rates.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	for _, want := range []string{
		"DELETE FROM exchange_rate_history",
		"information_schema.columns",
		"@currency_provider_columns_exist = 3",
		"SET provider_source = NULL",
		"is_api_managed = 0",
		"provider_last_seen_at = NULL",
		"DELETE FROM exchange_rates",
		"code NOT IN ('TWD', 'MOP')",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("currency catalog migration missing %q", want)
		}
	}
	for _, blocked := range []string{"DROP TABLE", "TRUNCATE", "DROP DATABASE", "CREATE DATABASE"} {
		if strings.Contains(strings.ToUpper(sql), blocked) {
			t.Fatalf("currency catalog migration must not use unsafe SQL, found %q", blocked)
		}
	}
}

func TestLegacyCurrencyAuditReportsLegacyProviderCurrentRows(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "scripts", "legacy_currency_audit.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sql := string(content)
	for _, want := range []string{
		"FROM exchange_rates",
		"source NOT IN ('manual', 'budget_default', 'bochk')",
		"provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')",
		"GROUP BY source, provider_rate_type",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("legacy currency audit must report legacy provider current rows, missing %q", want)
		}
	}
}

func TestMigrationFilesRejectDuplicateVersions(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "001_first.sql"), []byte("SELECT 1;"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "001_second.sql"), []byte("SELECT 1;"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := migrationFiles(dir)
	if err == nil || !strings.Contains(err.Error(), "duplicate migration version 001") {
		t.Fatalf("expected duplicate migration version error, got %v", err)
	}
}

func TestMigrationFilesIgnoreHiddenSQLFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "001_first.sql"), []byte("SELECT 1;"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "._001_first.sql"), []byte("SELECT 2;"), 0o600); err != nil {
		t.Fatal(err)
	}
	files, err := migrationFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Name != "001_first.sql" {
		t.Fatalf("expected only visible migration file, got %+v", files)
	}
}

func TestRecoverableDuplicateMigrationVersion(t *testing.T) {
	if !isRecoverableDuplicateMigrationVersion("027_user_avatar_url.sql", "027_webauthn_session_json.sql") {
		t.Fatal("expected old duplicate 027 avatar migration to be recoverable")
	}
	if isRecoverableDuplicateMigrationVersion("001_schema.sql", "001_other.sql") {
		t.Fatal("unexpected generic duplicate migration recovery")
	}
}

func TestRecoverableSeedCurrencyChecksumChange(t *testing.T) {
	current := migrationFile{
		Version:  "002",
		Name:     "002_seed_currencies.sql",
		Checksum: "a0826bd11ba4546bf7b2ec82a458048bf41cc956b054a6c0da5e44b5c62b1130",
	}
	if !isRecoverableChecksumChange("002_seed_currencies.sql", "old-checksum", current) {
		t.Fatal("expected 002 seed migration checksum drift to be recoverable")
	}
	if isRecoverableChecksumChange("001_schema.sql", "old-checksum", migrationFile{Name: "001_schema.sql", Checksum: current.Checksum}) {
		t.Fatal("unexpected generic checksum recovery")
	}
	if isRecoverableChecksumChange("002_seed_currencies.sql", "old-checksum", migrationFile{Name: "002_seed_currencies.sql", Checksum: "changed"}) {
		t.Fatal("unexpected recovery for unknown 002 checksum")
	}
	if isRecoverableChecksumChange("002_seed_currencies.sql", "old-checksum", migrationFile{Name: current.Name, Checksum: current.Checksum}) {
		t.Fatal("unexpected recovery without migration version")
	}
}

func TestRecoverableCurrencyCatalogChecksumChange(t *testing.T) {
	current := migrationFile{
		Version:  "036",
		Name:     "036_currency_catalog_current_rates.sql",
		Checksum: "e902e2dd1f46c0b8db09fd522a43c5e83f2aa6b739784214d7e00ee6a697374f",
	}
	if !isRecoverableChecksumChange("036_currency_catalog_current_rates.sql", "03449023b021420e523a3d663957b3a0e2160daa1654fc3f5ce4985ef068a310", current) {
		t.Fatal("expected 036 catalog migration checksum drift to be recoverable")
	}
	if isRecoverableChecksumChange("036_currency_catalog_current_rates.sql", "old-checksum", current) {
		t.Fatal("unexpected recovery for unknown 036 checksum")
	}
}

func TestSchemaMigrationAdvisoryLockUsesDedicatedConnection(t *testing.T) {
	content, err := os.ReadFile("migrations.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	for _, want := range []string{"db.Conn(ctx)", "conn.QueryRowContext", "conn.ExecContext", "conn.Close()"} {
		if !strings.Contains(source, want) {
			t.Fatalf("schema migration advisory lock must use one dedicated connection, missing %q", want)
		}
	}
}
