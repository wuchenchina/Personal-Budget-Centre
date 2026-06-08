SET @budget_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'budget_type'
);

SET @sql := IF(
  @budget_type_exists = 0,
  'ALTER TABLE budgets ADD COLUMN budget_type ENUM(''regular'', ''installment'') NOT NULL DEFAULT ''regular'' AFTER display_currency_id',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @installment_period_unit_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'installment_period_unit'
);

SET @sql := IF(
  @installment_period_unit_exists = 0,
  'ALTER TABLE budgets ADD COLUMN installment_period_unit ENUM(''day'', ''week'', ''month'', ''year'') NOT NULL DEFAULT ''month'' AFTER budget_type',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
