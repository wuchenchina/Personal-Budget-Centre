SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'default_pdf_theme'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN default_pdf_theme VARCHAR(40) NOT NULL DEFAULT ''classic'' AFTER locale',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
