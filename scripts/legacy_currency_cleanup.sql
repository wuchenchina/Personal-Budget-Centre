SET NAMES utf8mb4;

-- Run after the Go backend has completed migrations, and only after reviewing
-- scripts/legacy_currency_audit.sql. This deletes TWD/MOP only when no migrated
-- table still references them.

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

SELECT code
FROM currencies
WHERE code IN ('TWD', 'MOP')
ORDER BY code;
