SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS currencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(3) NOT NULL,
  name VARCHAR(120) NOT NULL,
  symbol VARCHAR(16) NOT NULL,
  decimal_places TINYINT UNSIGNED NOT NULL DEFAULT 2,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_currencies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(80) NULL,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(120) NOT NULL,
  default_currency_id BIGINT UNSIGNED NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
  locale VARCHAR(32) NOT NULL DEFAULT 'zh-Hant',
  status ENUM('active', 'disabled', 'pending') NOT NULL DEFAULT 'active',
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  email_verified_at DATETIME NULL,
  email_verification_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT fk_users_default_currency FOREIGN KEY (default_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_verification_tokens_hash (token_hash),
  KEY idx_email_verification_tokens_user (user_id),
  CONSTRAINT fk_email_verification_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  current_workspace_id BIGINT UNSIGNED NULL,
  session_token_hash CHAR(64) NOT NULL,
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_sessions_token (session_token_hash),
  KEY idx_user_sessions_user (user_id),
  KEY idx_user_sessions_workspace (current_workspace_id),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  credential_id VARBINARY(1024) NOT NULL,
  public_key TEXT NOT NULL,
  sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports_json JSON NULL,
  attestation_type VARCHAR(80) NULL,
  trust_path_json JSON NULL,
  backup_eligible TINYINT(1) NOT NULL DEFAULT 0,
  backup_state TINYINT(1) NOT NULL DEFAULT 0,
  device_name VARCHAR(160) NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webauthn_credentials_id (credential_id),
  KEY idx_webauthn_credentials_user (user_id),
  CONSTRAINT fk_webauthn_credentials_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  challenge CHAR(128) NOT NULL,
  type ENUM('registration', 'authentication') NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webauthn_challenges_challenge (challenge),
  KEY idx_webauthn_challenges_user (user_id),
  CONSTRAINT fk_webauthn_challenges_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  type ENUM('personal', 'family', 'team', 'custom') NOT NULL DEFAULT 'personal',
  default_currency_id BIGINT UNSIGNED NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
  settings_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_workspaces_owner (owner_user_id),
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_workspaces_currency FOREIGN KEY (default_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  scope ENUM('workspace', 'budget', 'system') NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_key_scope (role_key, scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permissions_key (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'invited', 'disabled', 'left') NOT NULL DEFAULT 'active',
  joined_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workspace_members_user (workspace_id, user_id),
  CONSTRAINT fk_workspace_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_members_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  invited_by_user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workspace_invitations_token (token_hash),
  KEY idx_workspace_invitations_email (email),
  CONSTRAINT fk_workspace_invitations_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_invitations_inviter FOREIGN KEY (invited_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_workspace_invitations_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workgroups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workgroups_name (workspace_id, name),
  CONSTRAINT fk_workgroups_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workgroups_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workgroup_members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workgroup_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  added_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workgroup_members_user (workgroup_id, user_id),
  CONSTRAINT fk_workgroup_members_group FOREIGN KEY (workgroup_id) REFERENCES workgroups(id) ON DELETE CASCADE,
  CONSTRAINT fk_workgroup_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workgroup_members_added_by FOREIGN KEY (added_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  workspace_id BIGINT UNSIGNED NULL,
  from_currency_id BIGINT UNSIGNED NOT NULL,
  to_currency_id BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(20, 10) NOT NULL,
  rate_date DATE NOT NULL,
  source ENUM('manual', 'budget_default', 'bochk', 'mastercard') NOT NULL DEFAULT 'manual',
  source_name VARCHAR(160) NULL,
  source_url VARCHAR(500) NULL,
  provider_rate_type ENUM('manual', 'mid', 'card') NOT NULL DEFAULT 'manual',
  provider_sell_rate DECIMAL(20, 10) NULL,
  provider_buy_rate DECIMAL(20, 10) NULL,
  provider_updated_at DATETIME NULL,
  fetched_at DATETIME NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exchange_rates_pair_date (from_currency_id, to_currency_id, rate_date),
  KEY idx_exchange_rates_workspace_source_date (workspace_id, source, rate_date),
  CONSTRAINT fk_exchange_rates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_exchange_rates_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_exchange_rates_from FOREIGN KEY (from_currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_exchange_rates_to FOREIGN KEY (to_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  currency_id BIGINT UNSIGNED NOT NULL,
  type ENUM('cash', 'bank', 'credit', 'deposit', 'other') NOT NULL DEFAULT 'bank',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_accounts_workspace (workspace_id),
  CONSTRAINT fk_accounts_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_accounts_currency FOREIGN KEY (currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  scope_key VARCHAR(120) NOT NULL DEFAULT 'global',
  name VARCHAR(160) NOT NULL,
  template_key VARCHAR(120) NOT NULL,
  style_json JSON NOT NULL,
  structure_json JSON NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_budget_templates_workspace (workspace_id),
  UNIQUE KEY uq_budget_templates_key_scope (template_key, scope_key),
  CONSTRAINT fk_budget_templates_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_templates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budgets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  owner_name VARCHAR(160) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  base_currency_id BIGINT UNSIGNED NOT NULL,
  display_currency_id BIGINT UNSIGNED NOT NULL,
  visibility ENUM('private', 'workspace', 'custom') NOT NULL DEFAULT 'private',
  status ENUM('draft', 'active', 'closed', 'archived') NOT NULL DEFAULT 'draft',
  note TEXT NULL,
  signature_config JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_budgets_workspace_period (workspace_id, start_date, end_date),
  CONSTRAINT fk_budgets_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_budgets_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_budgets_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_budgets_template FOREIGN KEY (template_id) REFERENCES budget_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_budgets_base_currency FOREIGN KEY (base_currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_budgets_display_currency FOREIGN KEY (display_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  default_currency_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_categories_name (workspace_id, name),
  CONSTRAINT fk_budget_categories_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_categories_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_budget_categories_parent FOREIGN KEY (parent_id) REFERENCES budget_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_categories_currency FOREIGN KEY (default_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_category_aliases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  alias VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_category_aliases_alias (workspace_id, alias),
  CONSTRAINT fk_budget_category_aliases_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_category_aliases_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_budget_category_aliases_category FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_shares (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  principal_type ENUM('user', 'workgroup', 'workspace') NOT NULL,
  principal_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  can_export TINYINT(1) NOT NULL DEFAULT 0,
  can_reshare TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_shares_principal (budget_id, principal_type, principal_id),
  CONSTRAINT fk_budget_shares_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_shares_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_budget_shares_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  can_export TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_share_links_token (token_hash),
  CONSTRAINT fk_share_links_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_share_links_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  label VARCHAR(180) NOT NULL,
  budget_currency_id BIGINT UNSIGNED NOT NULL,
  budget_amount_original DECIMAL(18, 4) NOT NULL DEFAULT 0,
  budget_rate_to_base DECIMAL(20, 10) NOT NULL DEFAULT 1,
  budget_amount_base DECIMAL(18, 4) NOT NULL DEFAULT 0,
  estimated_currency_id BIGINT UNSIGNED NOT NULL,
  estimated_amount_original DECIMAL(18, 4) NOT NULL DEFAULT 0,
  estimated_rate_to_base DECIMAL(20, 10) NOT NULL DEFAULT 1,
  estimated_amount_base DECIMAL(18, 4) NOT NULL DEFAULT 0,
  variance_amount_base DECIMAL(18, 4) NOT NULL DEFAULT 0,
  installment_config JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_budget_items_budget (budget_id),
  CONSTRAINT fk_budget_items_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_items_category FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_items_budget_currency FOREIGN KEY (budget_currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_budget_items_estimated_currency FOREIGN KEY (estimated_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  account_id BIGINT UNSIGNED NULL,
  transaction_date DATE NULL,
  details VARCHAR(500) NOT NULL,
  currency_id BIGINT UNSIGNED NOT NULL,
  amount_original DECIMAL(18, 4) NOT NULL,
  rate_to_base DECIMAL(20, 10) NOT NULL DEFAULT 1,
  amount_base DECIMAL(18, 4) NOT NULL,
  reference_currency_id BIGINT UNSIGNED NULL,
  reference_amount_original DECIMAL(18, 4) NULL,
  remark VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_budget_transactions_budget (budget_id),
  KEY idx_budget_transactions_category (category_id),
  CONSTRAINT fk_budget_transactions_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_transactions_category FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_transactions_currency FOREIGN KEY (currency_id) REFERENCES currencies(id),
  CONSTRAINT fk_budget_transactions_reference_currency FOREIGN KEY (reference_currency_id) REFERENCES currencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_exports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  format ENUM('pdf') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_budget_exports_budget (budget_id),
  CONSTRAINT fk_budget_exports_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_exports_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('docx', 'json', 'markdown') NOT NULL,
  source_file VARCHAR(500) NULL,
  status ENUM('queued', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_jobs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_logs_workspace (workspace_id),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_logs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
