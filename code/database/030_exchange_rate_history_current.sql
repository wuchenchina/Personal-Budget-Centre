SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  current_rate_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  workspace_id BIGINT UNSIGNED NULL,
  from_currency_id BIGINT UNSIGNED NOT NULL,
  to_currency_id BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(20, 10) NOT NULL,
  rate_date DATE NOT NULL,
  source ENUM('manual', 'budget_default', 'bochk') NOT NULL DEFAULT 'manual',
  source_name VARCHAR(160) NULL,
  source_url VARCHAR(500) NULL,
  provider_rate_type ENUM('manual', 'mid', 'card', 'customer_sell', 'customer_buy') NOT NULL DEFAULT 'manual',
  provider_sell_rate DECIMAL(20, 10) NULL,
  provider_buy_rate DECIMAL(20, 10) NULL,
  provider_updated_at DATETIME NULL,
  fetched_at DATETIME NULL,
  note VARCHAR(500) NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  original_created_at DATETIME NULL,
  KEY idx_exchange_rate_history_pair_date (workspace_id, from_currency_id, to_currency_id, rate_date),
  KEY idx_exchange_rate_history_source_date (source, rate_date),
  CONSTRAINT fk_exchange_rate_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_exchange_rate_history_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_exchange_rate_history_from FOREIGN KEY (from_currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_exchange_rate_history_to FOREIGN KEY (to_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @currency_provider_source_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'currencies'
    AND column_name = 'provider_source'
);
SET @sql := IF(
  @currency_provider_source_exists = 0,
  'ALTER TABLE currencies ADD COLUMN provider_source VARCHAR(40) NULL AFTER is_enabled',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @currency_api_managed_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'currencies'
    AND column_name = 'is_api_managed'
);
SET @sql := IF(
  @currency_api_managed_exists = 0,
  'ALTER TABLE currencies ADD COLUMN is_api_managed TINYINT(1) NOT NULL DEFAULT 0 AFTER provider_source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @currency_seen_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'currencies'
    AND column_name = 'provider_last_seen_at'
);
SET @sql := IF(
  @currency_seen_exists = 0,
  'ALTER TABLE currencies ADD COLUMN provider_last_seen_at DATETIME NULL AFTER is_api_managed',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE currencies
SET provider_source = 'bochk',
    is_api_managed = 1
WHERE code IN (
  'CNY',
  'CNH',
  'HKD',
  'USD',
  'GBP',
  'JPY',
  'AUD',
  'NZD',
  'CAD',
  'EUR',
  'CHF',
  'DKK',
  'NOK',
  'SEK',
  'SGD',
  'THB',
  'BND',
  'ZAR'
);

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
    WHEN er.source IN ('manual', 'budget_default', 'bochk') THEN er.source
    ELSE 'manual'
  END,
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
WHERE NOT EXISTS (
  SELECT 1
  FROM exchange_rate_history erh
  WHERE erh.current_rate_id = er.id
    AND erh.original_created_at = er.created_at
);

DELETE er
FROM exchange_rates er
JOIN exchange_rates newer
  ON er.from_currency_id = newer.from_currency_id
 AND er.to_currency_id = newer.to_currency_id
 AND er.source = newer.source
 AND er.provider_rate_type = newer.provider_rate_type
 AND (er.workspace_id <=> newer.workspace_id)
 AND (
   newer.rate_date > er.rate_date
   OR (newer.rate_date = er.rate_date AND newer.id > er.id)
 );

DELETE FROM currencies
WHERE code IN ('TWD', 'MOP')
  AND id NOT IN (SELECT default_currency_id FROM users WHERE default_currency_id IS NOT NULL)
  AND id NOT IN (SELECT default_currency_id FROM workspaces WHERE default_currency_id IS NOT NULL)
  AND id NOT IN (SELECT from_currency_id FROM exchange_rates)
  AND id NOT IN (SELECT to_currency_id FROM exchange_rates)
  AND id NOT IN (SELECT from_currency_id FROM exchange_rate_history)
  AND id NOT IN (SELECT to_currency_id FROM exchange_rate_history)
  AND id NOT IN (SELECT currency_id FROM accounts)
  AND id NOT IN (SELECT default_currency_id FROM budget_categories WHERE default_currency_id IS NOT NULL)
  AND id NOT IN (SELECT base_currency_id FROM budgets)
  AND id NOT IN (SELECT display_currency_id FROM budgets)
  AND id NOT IN (SELECT budget_currency_id FROM budget_items)
  AND id NOT IN (SELECT estimated_currency_id FROM budget_items)
  AND id NOT IN (SELECT currency_id FROM budget_transactions)
  AND id NOT IN (SELECT reference_currency_id FROM budget_transactions WHERE reference_currency_id IS NOT NULL)
  AND id NOT IN (SELECT destination_currency_id FROM budget_transactions WHERE destination_currency_id IS NOT NULL)
  AND id NOT IN (SELECT currency_id FROM budget_bookkeeping_records)
  AND id NOT IN (SELECT destination_currency_id FROM budget_bookkeeping_records WHERE destination_currency_id IS NOT NULL);
