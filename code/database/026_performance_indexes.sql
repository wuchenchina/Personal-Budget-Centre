SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_items'
    AND index_name = 'idx_budget_items_budget_sort'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_items ADD KEY idx_budget_items_budget_sort (budget_id, sort_order, id)',
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
    AND index_name = 'idx_budget_transactions_budget_category_sort'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_transactions ADD KEY idx_budget_transactions_budget_category_sort (budget_id, category_id, sort_order, id)',
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
    AND index_name = 'idx_budget_transactions_budget_sort'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_transactions ADD KEY idx_budget_transactions_budget_sort (budget_id, sort_order, id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_bookkeeping_records'
    AND index_name = 'idx_budget_bookkeeping_records_budget_type_date'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_bookkeeping_records ADD KEY idx_budget_bookkeeping_records_budget_type_date (budget_id, transaction_type, record_date, sort_order, id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND index_name = 'idx_budget_exports_budget_format_created'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE budget_exports ADD KEY idx_budget_exports_budget_format_created (budget_id, format, created_at, id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_workspace_created'
);
SET @sql := IF(
  @index_exists = 0,
  'ALTER TABLE audit_logs ADD KEY idx_audit_logs_workspace_created (workspace_id, created_at, id)',
  'DO 0'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
