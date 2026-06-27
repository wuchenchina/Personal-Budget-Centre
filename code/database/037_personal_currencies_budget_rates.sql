SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS user_currencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  currency_id BIGINT UNSIGNED NOT NULL,
  source ENUM('manual', 'catalog', 'referenced', 'bank_reference') NOT NULL DEFAULT 'manual',
  display_name VARCHAR(120) NULL,
  display_symbol VARCHAR(16) NULL,
  display_decimal_places TINYINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_currencies_user_currency (user_id, currency_id),
  KEY idx_user_currencies_currency (currency_id),
  CONSTRAINT fk_user_currencies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_currencies_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_exchange_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  from_currency_id BIGINT UNSIGNED NOT NULL,
  to_currency_id BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(20, 10) NOT NULL,
  rate_date DATE NOT NULL,
  source_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_exchange_rates_pair (budget_id, from_currency_id, to_currency_id),
  KEY idx_budget_exchange_rates_user (user_id),
  KEY idx_budget_exchange_rates_pair_date (from_currency_id, to_currency_id, rate_date),
  CONSTRAINT fk_budget_exchange_rates_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_exchange_rates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_exchange_rates_from FOREIGN KEY (from_currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_budget_exchange_rates_to FOREIGN KEY (to_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT u.id, u.default_currency_id, 'referenced', 1
FROM users u
WHERE u.default_currency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT w.owner_user_id, w.default_currency_id, 'referenced', 1
FROM workspaces w
WHERE w.default_currency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.user_id, b.base_currency_id, 'referenced', 1
FROM budgets b
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.user_id, b.display_currency_id, 'referenced', 1
FROM budgets b
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, bi.budget_currency_id, 'referenced', 1
FROM budget_items bi
JOIN budgets b ON b.id = bi.budget_id
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, bi.estimated_currency_id, 'referenced', 1
FROM budget_items bi
JOIN budgets b ON b.id = bi.budget_id
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, bt.currency_id, 'referenced', 1
FROM budget_transactions bt
JOIN budgets b ON b.id = bt.budget_id
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, bt.reference_currency_id, 'referenced', 1
FROM budget_transactions bt
JOIN budgets b ON b.id = bt.budget_id
WHERE bt.reference_currency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, bt.destination_currency_id, 'referenced', 1
FROM budget_transactions bt
JOIN budgets b ON b.id = bt.budget_id
WHERE bt.destination_currency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, br.currency_id, 'referenced', 1
FROM budget_bookkeeping_records br
JOIN budgets b ON b.id = br.budget_id
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO user_currencies (user_id, currency_id, source, is_active)
SELECT DISTINCT b.created_by_user_id, br.destination_currency_id, 'referenced', 1
FROM budget_bookkeeping_records br
JOIN budgets b ON b.id = br.budget_id
WHERE br.destination_currency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;
