package database

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"budgetcentre/backend/internal/config"

	_ "github.com/go-sql-driver/mysql"
)

func Open(cfg config.Config) (*sql.DB, error) {
	if cfg.DBName == "" || cfg.DBUser == "" {
		return nil, errors.New("DB_NAME and DB_USER are required")
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&charset=utf8mb4&multiStatements=false&loc=UTC",
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBName,
	)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	return db, db.Ping()
}
