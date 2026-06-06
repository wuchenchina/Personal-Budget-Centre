CREATE OR REPLACE VIEW v_budget_item_totals AS
SELECT
  budget_id,
  SUM(budget_amount_base) AS total_budget_base,
  SUM(estimated_amount_base) AS total_estimated_base,
  SUM(variance_amount_base) AS total_variance_base
FROM budget_items
GROUP BY budget_id;

CREATE OR REPLACE VIEW v_transaction_totals_by_category AS
SELECT
  bt.budget_id,
  bt.category_id,
  COALESCE(bc.name, bt.details) AS category_name,
  COUNT(*) AS transaction_count,
  SUM(bt.amount_base) AS transaction_total_base
FROM budget_transactions bt
LEFT JOIN budget_categories bc ON bc.id = bt.category_id
GROUP BY bt.budget_id, bt.category_id, COALESCE(bc.name, bt.details);

CREATE OR REPLACE VIEW v_budget_reconciliation AS
SELECT
  bi.budget_id,
  bi.category_id,
  bi.label,
  bi.estimated_amount_base,
  COALESCE(tx.transaction_total_base, 0) AS transaction_total_base,
  bi.estimated_amount_base - COALESCE(tx.transaction_total_base, 0) AS difference_base
FROM budget_items bi
LEFT JOIN (
  SELECT
    budget_id,
    category_id,
    SUM(amount_base) AS transaction_total_base
  FROM budget_transactions
  GROUP BY budget_id, category_id
) tx ON tx.budget_id = bi.budget_id
  AND (
    tx.category_id = bi.category_id
    OR (tx.category_id IS NULL AND bi.category_id IS NULL)
  );
