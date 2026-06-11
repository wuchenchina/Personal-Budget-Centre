SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND column_name = 'paid_by_participant_id'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_transactions ADD COLUMN paid_by_participant_id BIGINT UNSIGNED NULL AFTER category_id',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND index_name = 'idx_budget_transactions_paid_by'
);

SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_transactions ADD KEY idx_budget_transactions_paid_by (paid_by_participant_id)',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @budget_participants_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_participants'
);

SET @constraint_exists := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_transactions'
    AND constraint_name = 'fk_budget_transactions_paid_by'
);

SET @sql := IF(
  @budget_participants_exists = 1 AND @constraint_exists = 0,
  'ALTER TABLE budget_transactions ADD CONSTRAINT fk_budget_transactions_paid_by FOREIGN KEY (paid_by_participant_id) REFERENCES budget_participants(id) ON DELETE SET NULL',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
