SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'reference_currency_id'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN reference_currency_id BIGINT UNSIGNED NULL AFTER amount_base',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'reference_amount_original'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN reference_amount_original DECIMAL(18, 4) NULL AFTER reference_currency_id',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND constraint_name = 'fk_budget_transactions_reference_currency'
);

SET @sql := IF(
  @constraint_exists = 0,
  'ALTER TABLE budget_transactions ADD CONSTRAINT fk_budget_transactions_reference_currency FOREIGN KEY (reference_currency_id) REFERENCES currencies(id)',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
