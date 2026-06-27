SET NAMES utf8mb4;

-- Run after the Go backend has completed migrations. This audits old TWD/MOP
-- references that block safe manual deletion from migrated legacy databases.

SELECT 'users.default_currency_id' AS location, c.code, COUNT(*) AS rows_found
FROM users u JOIN currencies c ON c.id = u.default_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'workspaces.default_currency_id', c.code, COUNT(*)
FROM workspaces w JOIN currencies c ON c.id = w.default_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'exchange_rates.from_currency_id', c.code, COUNT(*)
FROM exchange_rates er JOIN currencies c ON c.id = er.from_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'exchange_rates.to_currency_id', c.code, COUNT(*)
FROM exchange_rates er JOIN currencies c ON c.id = er.to_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'exchange_rate_history.from_currency_id', c.code, COUNT(*)
FROM exchange_rate_history erh JOIN currencies c ON c.id = erh.from_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'exchange_rate_history.to_currency_id', c.code, COUNT(*)
FROM exchange_rate_history erh JOIN currencies c ON c.id = erh.to_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'accounts.currency_id', c.code, COUNT(*)
FROM accounts a JOIN currencies c ON c.id = a.currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_categories.default_currency_id', c.code, COUNT(*)
FROM budget_categories bc JOIN currencies c ON c.id = bc.default_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budgets.base_currency_id', c.code, COUNT(*)
FROM budgets b JOIN currencies c ON c.id = b.base_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budgets.display_currency_id', c.code, COUNT(*)
FROM budgets b JOIN currencies c ON c.id = b.display_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_items.budget_currency_id', c.code, COUNT(*)
FROM budget_items bi JOIN currencies c ON c.id = bi.budget_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_items.estimated_currency_id', c.code, COUNT(*)
FROM budget_items bi JOIN currencies c ON c.id = bi.estimated_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_transactions.currency_id', c.code, COUNT(*)
FROM budget_transactions bt JOIN currencies c ON c.id = bt.currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_transactions.reference_currency_id', c.code, COUNT(*)
FROM budget_transactions bt JOIN currencies c ON c.id = bt.reference_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_transactions.destination_currency_id', c.code, COUNT(*)
FROM budget_transactions bt JOIN currencies c ON c.id = bt.destination_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_bookkeeping_records.currency_id', c.code, COUNT(*)
FROM budget_bookkeeping_records br JOIN currencies c ON c.id = br.currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
UNION ALL
SELECT 'budget_bookkeeping_records.destination_currency_id', c.code, COUNT(*)
FROM budget_bookkeeping_records br JOIN currencies c ON c.id = br.destination_currency_id
WHERE c.code IN ('TWD', 'MOP')
GROUP BY c.code
ORDER BY code, location;

-- After migration 034, this should return zero rows. Any result here means
-- legacy provider rates are still in the current table instead of history.
SELECT source, provider_rate_type, COUNT(*) AS rows_found
FROM exchange_rates
WHERE source NOT IN ('manual', 'budget_default', 'bank_reference')
   OR provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')
   OR (source = 'bank_reference' AND provider_rate_type NOT IN ('customer_sell', 'customer_buy'))
   OR (source IN ('manual', 'budget_default') AND provider_rate_type <> 'manual')
GROUP BY source, provider_rate_type
ORDER BY source, provider_rate_type;
