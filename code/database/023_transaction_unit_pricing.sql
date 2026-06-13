SET @transaction_pricing_config_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'pricing_config'
);

SET @sql := IF(
  @transaction_pricing_config_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN pricing_config JSON NULL AFTER amount_base',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
