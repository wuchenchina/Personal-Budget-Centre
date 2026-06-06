SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'username'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN username VARCHAR(80) NULL AFTER email',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email_verified_at'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER status',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email_verification_sent_at'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN email_verification_sent_at DATETIME NULL AFTER email_verified_at',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'uq_users_username'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_verification_tokens_hash (token_hash),
  KEY idx_email_verification_tokens_user (user_id),
  CONSTRAINT fk_email_verification_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE status = 'active'
  AND email_verified_at IS NULL;
