SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS user_sso_bindings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_subject VARCHAR(191) NOT NULL,
  provider_username VARCHAR(191) NULL,
  provider_email VARCHAR(255) NULL,
  raw_userinfo_json JSON NULL,
  linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_sso_bindings_user_provider (user_id, provider),
  UNIQUE KEY uq_user_sso_bindings_provider_subject (provider, provider_subject),
  CONSTRAINT fk_user_sso_bindings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
