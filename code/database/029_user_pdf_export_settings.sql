SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'pdf_export_settings'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN pdf_export_settings JSON NULL AFTER default_pdf_theme',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
