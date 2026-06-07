SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_items'
    AND column_name = 'installment_config'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_items ADD COLUMN installment_config JSON NULL AFTER variance_amount_base',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
