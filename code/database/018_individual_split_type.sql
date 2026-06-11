SET @budget_item_splits_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_item_splits'
);

SET @split_type_has_individual := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_item_splits'
    AND column_name = 'split_type'
    AND column_type LIKE '%''individual''%'
);

SET @sql := IF(
  @budget_item_splits_exists = 1 AND @split_type_has_individual = 0,
  'ALTER TABLE budget_item_splits MODIFY split_type ENUM(''equal'', ''personal'', ''individual'', ''per_person'', ''custom_amount'', ''custom_share'', ''excluded'') NOT NULL DEFAULT ''equal''',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
