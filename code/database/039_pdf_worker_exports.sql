SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'scope'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN scope VARCHAR(40) NOT NULL DEFAULT ''budget'' AFTER format',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'job_token'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN job_token CHAR(64) NULL AFTER status',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'options_json'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN options_json JSON NULL AFTER status',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS budget_export_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  export_id BIGINT UNSIGNED NOT NULL,
  event VARCHAR(80) NOT NULL,
  worker_id VARCHAR(120) NULL,
  message VARCHAR(1000) NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_budget_export_audit_export (export_id, created_at),
  CONSTRAINT fk_budget_export_audit_export FOREIGN KEY (export_id) REFERENCES budget_exports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'progress_percent'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER error_message',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'progress_stage'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN progress_stage VARCHAR(80) NOT NULL DEFAULT ''queued'' AFTER progress_percent',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'rows_total'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN rows_total BIGINT UNSIGNED NULL AFTER progress_stage',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'rows_processed'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN rows_processed BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER rows_total',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'pages'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN pages INT UNSIGNED NULL AFTER rows_processed',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'file_size'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN file_size BIGINT UNSIGNED NULL AFTER pages',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'locked_by'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN locked_by VARCHAR(120) NULL AFTER file_size',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'locked_until'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN locked_until DATETIME NULL AFTER locked_by',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'attempt'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN attempt INT UNSIGNED NOT NULL DEFAULT 0 AFTER locked_until',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'started_at'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN started_at DATETIME NULL AFTER created_at',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND column_name = 'completed_at'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_exports ADD COLUMN completed_at DATETIME NULL AFTER started_at',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND index_name = 'idx_budget_exports_status_lock'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_exports ADD KEY idx_budget_exports_status_lock (status, locked_until, created_at, id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
