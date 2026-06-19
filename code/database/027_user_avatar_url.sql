SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'avatar_url'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL AFTER display_name',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
