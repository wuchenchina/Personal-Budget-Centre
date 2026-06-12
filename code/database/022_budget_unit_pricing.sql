SET @budget_pricing_enabled_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'pricing_enabled'
);

SET @sql := IF(
  @budget_pricing_enabled_exists = 0,
  'ALTER TABLE budgets ADD COLUMN pricing_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER installment_period_unit',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @budget_item_pricing_config_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_items'
    AND column_name = 'pricing_config'
);

SET @sql := IF(
  @budget_item_pricing_config_exists = 0,
  'ALTER TABLE budget_items ADD COLUMN pricing_config JSON NULL AFTER installment_config',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
