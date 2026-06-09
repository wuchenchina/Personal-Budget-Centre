CREATE TABLE IF NOT EXISTS budget_installment_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  scope ENUM('overall') NOT NULL DEFAULT 'overall',
  period_amounts JSON NULL,
  period_locked JSON NULL,
  period_progress JSON NULL,
  period_remarks JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_installment_plans_scope (budget_id, scope),
  CONSTRAINT fk_budget_installment_plans_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @budget_installment_plan_locked_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budget_installment_plans'
    AND column_name = 'period_locked'
);

SET @sql := IF(
  @budget_installment_plan_locked_exists = 0,
  'ALTER TABLE budget_installment_plans ADD COLUMN period_locked JSON NULL AFTER period_amounts',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
