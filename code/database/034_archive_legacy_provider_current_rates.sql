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
  CASE
    WHEN er.source IN ('manual', 'budget_default', 'bank_reference') THEN er.source
    ELSE 'manual'
  END,
  er.source_name,
  er.source_url,
  CASE
    WHEN er.provider_rate_type IN ('manual', 'mid', 'card', 'customer_sell', 'customer_buy')
      THEN er.provider_rate_type
    ELSE 'manual'
  END,
  er.provider_sell_rate,
  er.provider_buy_rate,
  er.provider_updated_at,
  er.fetched_at,
  er.note,
  er.created_at
FROM exchange_rates er
WHERE (
    er.source NOT IN ('manual', 'budget_default', 'bank_reference')
    OR er.provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')
    OR (er.source = 'bank_reference' AND er.provider_rate_type NOT IN ('customer_sell', 'customer_buy'))
    OR (er.source IN ('manual', 'budget_default') AND er.provider_rate_type <> 'manual')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM exchange_rate_history erh
    WHERE erh.current_rate_id = er.id
      AND erh.original_created_at = er.created_at
  );

DELETE FROM exchange_rates
WHERE source NOT IN ('manual', 'budget_default', 'bank_reference')
   OR provider_rate_type NOT IN ('manual', 'customer_sell', 'customer_buy')
   OR (source = 'bank_reference' AND provider_rate_type NOT IN ('customer_sell', 'customer_buy'))
   OR (source IN ('manual', 'budget_default') AND provider_rate_type <> 'manual');
