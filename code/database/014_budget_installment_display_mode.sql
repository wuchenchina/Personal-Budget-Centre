SET @installment_display_mode_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'installment_display_mode'
);

SET @sql := IF(
  @installment_display_mode_exists = 0,
  'ALTER TABLE budgets ADD COLUMN installment_display_mode ENUM(''item'', ''overall'') NOT NULL DEFAULT ''item'' AFTER budget_type',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
