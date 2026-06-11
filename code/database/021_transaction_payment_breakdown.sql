CREATE TABLE IF NOT EXISTS budget_transaction_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL,
  participant_id BIGINT UNSIGNED NOT NULL,
  amount_original DECIMAL(18, 4) NOT NULL,
  amount_base DECIMAL(18, 4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_transaction_payments_participant (transaction_id, participant_id),
  KEY idx_budget_transaction_payments_participant (participant_id),
  CONSTRAINT fk_budget_transaction_payments_transaction FOREIGN KEY (transaction_id) REFERENCES budget_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_transaction_payments_participant FOREIGN KEY (participant_id) REFERENCES budget_participants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
