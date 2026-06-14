SET @transaction_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'transaction_type'
);

SET @sql := IF(
  @transaction_type_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN transaction_type VARCHAR(32) NOT NULL DEFAULT ''expense'' AFTER account_id',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_reference_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'order_reference'
);

SET @sql := IF(
  @order_reference_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN order_reference VARCHAR(120) NULL AFTER transaction_type',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_account_name_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'source_account_name'
);

SET @sql := IF(
  @source_account_name_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN source_account_name VARCHAR(160) NULL AFTER order_reference',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @destination_account_name_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'destination_account_name'
);

SET @sql := IF(
  @destination_account_name_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN destination_account_name VARCHAR(160) NULL AFTER source_account_name',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @destination_currency_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'destination_currency_id'
);

SET @sql := IF(
  @destination_currency_id_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN destination_currency_id BIGINT UNSIGNED NULL AFTER reference_amount_original',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @destination_amount_original_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'destination_amount_original'
);

SET @sql := IF(
  @destination_amount_original_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN destination_amount_original DECIMAL(18, 4) NULL AFTER destination_currency_id',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @destination_rate_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'destination_rate'
);

SET @sql := IF(
  @destination_rate_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN destination_rate DECIMAL(20, 10) NULL AFTER destination_amount_original',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @destination_currency_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND constraint_name = 'fk_budget_transactions_destination_currency'
);

SET @sql := IF(
  @destination_currency_fk_exists = 0,
  'ALTER TABLE budget_transactions ADD CONSTRAINT fk_budget_transactions_destination_currency FOREIGN KEY (destination_currency_id) REFERENCES currencies(id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
