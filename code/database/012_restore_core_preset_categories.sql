UPDATE budget_categories
SET
  is_preset = 1,
  is_active = 1
WHERE name IN ('Credit Repayment', 'Bill of Server');
