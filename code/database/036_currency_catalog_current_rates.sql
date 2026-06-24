SET NAMES utf8mb4;

DELETE FROM exchange_rate_history;

UPDATE currencies
SET provider_source = NULL,
    is_api_managed = 0,
    provider_last_seen_at = NULL
WHERE provider_source IS NOT NULL
   OR is_api_managed <> 0
   OR provider_last_seen_at IS NOT NULL;

DELETE FROM exchange_rates
WHERE from_currency_id NOT IN (SELECT id FROM currencies)
   OR to_currency_id NOT IN (SELECT id FROM currencies);

DELETE er
FROM exchange_rates er
JOIN currencies c
  ON c.id = er.from_currency_id
  OR c.id = er.to_currency_id
WHERE c.id NOT IN (SELECT default_currency_id FROM users WHERE default_currency_id IS NOT NULL)
  AND c.id NOT IN (SELECT default_currency_id FROM workspaces WHERE default_currency_id IS NOT NULL)
  AND c.id NOT IN (SELECT currency_id FROM accounts)
  AND c.id NOT IN (SELECT default_currency_id FROM budget_categories WHERE default_currency_id IS NOT NULL)
  AND c.id NOT IN (SELECT base_currency_id FROM budgets)
  AND c.id NOT IN (SELECT display_currency_id FROM budgets)
  AND c.id NOT IN (SELECT budget_currency_id FROM budget_items)
  AND c.id NOT IN (SELECT estimated_currency_id FROM budget_items)
  AND c.id NOT IN (SELECT currency_id FROM budget_transactions)
  AND c.id NOT IN (SELECT reference_currency_id FROM budget_transactions WHERE reference_currency_id IS NOT NULL)
  AND c.id NOT IN (SELECT destination_currency_id FROM budget_transactions WHERE destination_currency_id IS NOT NULL)
  AND c.id NOT IN (SELECT currency_id FROM budget_bookkeeping_records)
  AND c.id NOT IN (SELECT destination_currency_id FROM budget_bookkeeping_records WHERE destination_currency_id IS NOT NULL)
  AND c.code NOT IN ('TWD', 'MOP');

DELETE FROM currencies
WHERE id NOT IN (SELECT default_currency_id FROM users WHERE default_currency_id IS NOT NULL)
  AND id NOT IN (SELECT default_currency_id FROM workspaces WHERE default_currency_id IS NOT NULL)
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
  AND id NOT IN (SELECT destination_currency_id FROM budget_bookkeeping_records WHERE destination_currency_id IS NOT NULL)
  AND code NOT IN ('TWD', 'MOP');
