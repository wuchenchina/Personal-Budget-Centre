SET NAMES utf8mb4;

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
WHERE er.source = 'bank_reference'
  AND er.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM exchange_rate_history erh
    WHERE erh.current_rate_id = er.id
      AND erh.original_created_at = er.created_at
  );

DELETE FROM exchange_rates
WHERE source = 'bank_reference'
  AND workspace_id IS NOT NULL;

UPDATE exchange_rates
SET user_id = NULL
WHERE source = 'bank_reference'
  AND workspace_id IS NULL
  AND user_id IS NOT NULL;

UPDATE exchange_rate_history
SET user_id = NULL
WHERE source = 'bank_reference'
  AND workspace_id IS NULL
  AND user_id IS NOT NULL;
