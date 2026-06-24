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
