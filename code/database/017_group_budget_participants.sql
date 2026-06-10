SET @budget_participant_mode_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'budgets'
    AND column_name = 'participant_mode'
);

SET @sql := IF(
  @budget_participant_mode_exists = 0,
  'ALTER TABLE budgets ADD COLUMN participant_mode ENUM(''solo'', ''group'') NOT NULL DEFAULT ''solo'' AFTER budget_type',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS budget_participants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  member_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_budget_participants_budget (budget_id),
  CONSTRAINT fk_budget_participants_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_participants_user FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_item_splits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_item_id BIGINT UNSIGNED NOT NULL,
  paid_by_participant_id BIGINT UNSIGNED NULL,
  split_type ENUM('equal', 'personal', 'individual', 'per_person', 'custom_amount', 'custom_share', 'excluded') NOT NULL DEFAULT 'equal',
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_item_splits_item (budget_item_id),
  KEY idx_budget_item_splits_paid_by (paid_by_participant_id),
  CONSTRAINT fk_budget_item_splits_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_item_splits_paid_by FOREIGN KEY (paid_by_participant_id) REFERENCES budget_participants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_item_split_participants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  split_id BIGINT UNSIGNED NOT NULL,
  participant_id BIGINT UNSIGNED NOT NULL,
  is_included TINYINT(1) NOT NULL DEFAULT 1,
  share_ratio DECIMAL(12, 6) NULL,
  share_amount_base DECIMAL(18, 4) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_item_split_participants (split_id, participant_id),
  KEY idx_budget_item_split_participants_participant (participant_id),
  CONSTRAINT fk_budget_item_split_participants_split FOREIGN KEY (split_id) REFERENCES budget_item_splits(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_item_split_participants_participant FOREIGN KEY (participant_id) REFERENCES budget_participants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
