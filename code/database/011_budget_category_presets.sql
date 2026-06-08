SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_categories'
    AND column_name = 'is_preset'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE budget_categories ADD COLUMN is_preset TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @column_exists = 0,
  'UPDATE budget_categories bc
   SET bc.is_preset = 0
   WHERE LOWER(TRIM(bc.name)) LIKE ''top up %''
     AND bc.default_currency_id IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM budget_category_aliases bca
       WHERE bca.category_id = bc.id
     )
     AND EXISTS (
       SELECT 1
       FROM budget_items bi
       WHERE bi.category_id = bc.id
         AND LOWER(TRIM(bi.label)) = LOWER(TRIM(bc.name))
     )',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
