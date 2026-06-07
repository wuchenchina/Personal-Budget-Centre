SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'signature_config'
);
SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budgets ADD COLUMN signature_config JSON NULL AFTER note',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
