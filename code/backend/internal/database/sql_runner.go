package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	blockedSQL           = regexp.MustCompile(`(?is)\b(CREATE\s+DATABASE|DROP\s+DATABASE|USE\s+[` + "`" + `]?\w+|TRUNCATE|DROP\s+TABLE|DROP\s+VIEW)\b`)
	alterTableSQL        = regexp.MustCompile(`(?is)\bALTER\s+TABLE\s+[` + "`" + `]?([a-z0-9_]+)[` + "`" + `]?\s+([^;]*)`)
	destructiveAlterSQL  = regexp.MustCompile(`(?is)\b(DROP|RENAME|CHANGE|CONVERT|DISCARD|IMPORT|REORGANIZE|REBUILD|REMOVE|ALTER\s+COLUMN|ENGINE\s*=)\b`)
	modifyAlterColumnSQL = regexp.MustCompile(`(?is)\bMODIFY\s+(?:COLUMN\s+)?[` + "`" + `]?([a-z0-9_]+)[` + "`" + `]?`)
	allowedModifyColumns = map[string]bool{
		"end_date":           true,
		"provider_rate_type": true,
		"split_type":         true,
		"start_date":         true,
	}
)

func migrationFiles(dir string) ([]migrationFile, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		return nil, err
	}
	sort.Strings(paths)
	files := make([]migrationFile, 0, len(paths))
	seenVersions := map[string]string{}
	for _, path := range paths {
		name := filepath.Base(path)
		if strings.HasPrefix(name, ".") {
			continue
		}
		contentBytes, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		content := string(contentBytes)
		if err := validateSQLSafety(content, name); err != nil {
			return nil, err
		}
		version := name
		if idx := strings.Index(name, "_"); idx > 0 {
			version = name[:idx]
		}
		if existing, ok := seenVersions[version]; ok {
			return nil, fmt.Errorf("duplicate migration version %s: %s and %s", version, existing, name)
		}
		seenVersions[version] = name
		sum := sha256.Sum256(contentBytes)
		files = append(files, migrationFile{
			Version:  version,
			Name:     name,
			Path:     path,
			Checksum: hex.EncodeToString(sum[:]),
			Content:  content,
		})
	}
	return files, nil
}

func applyMigration(ctx context.Context, db *sql.DB, file migrationFile) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	statements, err := splitSQL(file.Content)
	if err != nil {
		return err
	}
	for _, statement := range statements {
		trimmed := strings.TrimSpace(statement)
		if trimmed == "" {
			continue
		}
		if err := validateSQLSafety(trimmed, file.Name); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, trimmed); err != nil {
			return fmt.Errorf("statement failed: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO schema_migrations (version, filename, checksum) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE filename = VALUES(filename), checksum = VALUES(checksum)",
		file.Version, file.Name, file.Checksum,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func validateSQLSafety(content, filename string) error {
	if blockedSQL.MatchString(content) {
		return fmt.Errorf("blocked unsafe SQL in %s", filename)
	}
	for _, match := range alterTableSQL.FindAllStringSubmatch(content, -1) {
		body := match[2]
		if destructiveAlterSQL.MatchString(body) {
			return fmt.Errorf("blocked unsafe ALTER statement in %s", filename)
		}
		for _, columnMatch := range modifyAlterColumnSQL.FindAllStringSubmatch(body, -1) {
			column := strings.ToLower(columnMatch[1])
			if !allowedModifyColumns[column] {
				return fmt.Errorf("blocked non-whitelisted ALTER MODIFY %s in %s", column, filename)
			}
		}
	}
	return nil
}

func splitSQL(content string) ([]string, error) {
	var statements []string
	var builder strings.Builder
	var quote rune
	escaped := false
	for _, r := range content {
		builder.WriteRune(r)
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' {
				escaped = true
				continue
			}
			if r == quote {
				quote = 0
			}
			continue
		}
		if r == '\'' || r == '"' || r == '`' {
			quote = r
			continue
		}
		if r == ';' {
			statements = append(statements, builder.String())
			builder.Reset()
		}
	}
	rest := strings.TrimSpace(builder.String())
	if rest != "" {
		statements = append(statements, rest)
	}
	if quote != 0 {
		return nil, errors.New("unterminated SQL quote")
	}
	return statements, nil
}
