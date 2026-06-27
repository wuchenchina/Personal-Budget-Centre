SET NAMES utf8mb4;

SET @legacy_provider_source := CHAR(98, 111, 99, 104, 107);
SET @legacy_directory_source := CHAR(109, 97, 115, 116, 101, 114, 99, 97, 114, 100);
SET @budgetcentre_previous_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'STRICT_TRANS_TABLES', ''), 'STRICT_ALL_TABLES', '');

ALTER TABLE exchange_rates
  MODIFY source VARCHAR(64) NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rates
  MODIFY provider_rate_type VARCHAR(40) NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rate_history
  MODIFY source VARCHAR(64) NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rate_history
  MODIFY provider_rate_type VARCHAR(40) NOT NULL DEFAULT 'manual';

INSERT INTO exchange_rate_history (
  current_rate_id,
  user_id,
  workspace_id,
  from_currency_id,
  to_currency_id,
  rate,
  rate_date,
  source,
  source_name,
  source_url,
  provider_rate_type,
  provider_sell_rate,
  provider_buy_rate,
  provider_updated_at,
  fetched_at,
  note,
  original_created_at
)
SELECT
  er.id,
  er.user_id,
  er.workspace_id,
  er.from_currency_id,
  er.to_currency_id,
  er.rate,
  er.rate_date,
  CASE
    WHEN er.source IN ('manual', 'budget_default', 'bank_reference') THEN er.source
    ELSE 'bank_reference'
  END,
  CASE
    WHEN er.source IN ('manual', 'budget_default') THEN er.source_name
    ELSE 'Reference rate provider'
  END,
  CASE
    WHEN er.source IN ('manual', 'budget_default') THEN er.source_url
    ELSE NULL
  END,
  CASE
    WHEN er.provider_rate_type IN ('manual', 'mid', 'card', 'customer_sell', 'customer_buy') THEN er.provider_rate_type
    ELSE 'manual'
  END,
  er.provider_sell_rate,
  er.provider_buy_rate,
  er.provider_updated_at,
  er.fetched_at,
  CASE
    WHEN er.source IN ('manual', 'budget_default') THEN er.note
    ELSE NULL
  END,
  er.created_at
FROM exchange_rates er
WHERE (
    er.source NOT IN ('manual', 'budget_default', 'bank_reference')
    OR er.source = ''
    OR er.provider_rate_type = 'card'
    OR er.provider_rate_type = ''
  )
  AND NOT EXISTS (
    SELECT 1
    FROM exchange_rate_history erh
    WHERE erh.current_rate_id = er.id
      AND erh.original_created_at = er.created_at
  );

DELETE FROM exchange_rates
WHERE provider_rate_type = 'card';

UPDATE exchange_rates
SET source = 'bank_reference',
    user_id = NULL,
    workspace_id = NULL,
    source_name = 'Reference rate provider',
    source_url = NULL,
    note = NULL
WHERE source NOT IN ('manual', 'budget_default', 'bank_reference')
   OR source = ''
   OR source = 'bank_reference';

UPDATE exchange_rates
SET provider_rate_type = 'manual'
WHERE provider_rate_type NOT IN ('manual', 'mid', 'customer_sell', 'customer_buy')
   OR provider_rate_type = '';

UPDATE exchange_rate_history
SET source_name = 'Reference rate provider',
    source_url = NULL,
    note = NULL
WHERE source = 'bank_reference';

UPDATE exchange_rate_history
SET source = 'bank_reference',
    source_name = 'Reference rate provider',
    source_url = NULL,
    note = NULL
WHERE source NOT IN ('manual', 'budget_default', 'bank_reference')
   OR source = '';

UPDATE exchange_rate_history
SET provider_rate_type = 'manual'
WHERE provider_rate_type NOT IN ('manual', 'mid', 'customer_sell', 'customer_buy')
   OR provider_rate_type = '';

INSERT INTO exchange_rate_history (
  current_rate_id,
  user_id,
  workspace_id,
  from_currency_id,
  to_currency_id,
  rate,
  rate_date,
  source,
  source_name,
  source_url,
  provider_rate_type,
  provider_sell_rate,
  provider_buy_rate,
  provider_updated_at,
  fetched_at,
  note,
  original_created_at
)
SELECT
  er.id,
  er.user_id,
  er.workspace_id,
  er.from_currency_id,
  er.to_currency_id,
  er.rate,
  er.rate_date,
  er.source,
  er.source_name,
  er.source_url,
  er.provider_rate_type,
  er.provider_sell_rate,
  er.provider_buy_rate,
  er.provider_updated_at,
  er.fetched_at,
  er.note,
  er.created_at
FROM exchange_rates er
JOIN exchange_rates newer
  ON er.source = 'bank_reference'
 AND newer.source = 'bank_reference'
 AND er.workspace_id IS NULL
 AND newer.workspace_id IS NULL
 AND er.from_currency_id = newer.from_currency_id
 AND er.to_currency_id = newer.to_currency_id
 AND er.provider_rate_type = newer.provider_rate_type
 AND (
   newer.rate_date > er.rate_date
   OR (newer.rate_date = er.rate_date AND newer.id > er.id)
 )
WHERE NOT EXISTS (
  SELECT 1
  FROM exchange_rate_history erh
  WHERE erh.current_rate_id = er.id
    AND erh.original_created_at = er.created_at
);

DELETE er
FROM exchange_rates er
JOIN exchange_rates newer
  ON er.source = 'bank_reference'
 AND newer.source = 'bank_reference'
 AND er.workspace_id IS NULL
 AND newer.workspace_id IS NULL
 AND er.from_currency_id = newer.from_currency_id
 AND er.to_currency_id = newer.to_currency_id
 AND er.provider_rate_type = newer.provider_rate_type
 AND (
   newer.rate_date > er.rate_date
   OR (newer.rate_date = er.rate_date AND newer.id > er.id)
 );

ALTER TABLE exchange_rates
  MODIFY source ENUM('manual', 'budget_default', 'bank_reference') NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rates
  MODIFY provider_rate_type ENUM('manual', 'mid', 'customer_sell', 'customer_buy') NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rate_history
  MODIFY source ENUM('manual', 'budget_default', 'bank_reference') NOT NULL DEFAULT 'manual';

ALTER TABLE exchange_rate_history
  MODIFY provider_rate_type ENUM('manual', 'mid', 'customer_sell', 'customer_buy') NOT NULL DEFAULT 'manual';

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'exchange_rates'
    AND index_name = 'idx_exchange_rates_reference_lookup'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE exchange_rates ADD KEY idx_exchange_rates_reference_lookup (source, workspace_id, from_currency_id, to_currency_id, provider_rate_type, rate_date, created_at, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'exchange_rates'
    AND index_name = 'idx_exchange_rates_account_manual_lookup'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE exchange_rates ADD KEY idx_exchange_rates_account_manual_lookup (source, workspace_id, user_id, from_currency_id, to_currency_id, rate_date, created_at, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'exchange_rates'
    AND index_name = 'idx_exchange_rates_reference_fetched'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE exchange_rates ADD KEY idx_exchange_rates_reference_fetched (source, workspace_id, fetched_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_items'
    AND index_name = 'idx_budget_items_budget_category'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE budget_items ADD KEY idx_budget_items_budget_category (budget_id, category_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_participants'
    AND index_name = 'idx_budget_participants_budget_sort'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE budget_participants ADD KEY idx_budget_participants_budget_sort (budget_id, sort_order, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_bookkeeping_records'
    AND index_name = 'idx_budget_bookkeeping_records_budget_sort'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE budget_bookkeeping_records ADD KEY idx_budget_bookkeeping_records_budget_sort (budget_id, sort_order, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_exports'
    AND index_name = 'idx_budget_exports_status_id'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE budget_exports ADD KEY idx_budget_exports_status_id (status, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_workspace_created'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE audit_logs ADD KEY idx_audit_logs_workspace_created (workspace_id, created_at, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET SESSION sql_mode = @budgetcentre_previous_sql_mode;
