package database

import "testing"

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
