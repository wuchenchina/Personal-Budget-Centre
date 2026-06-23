SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'webauthn_challenges'
    AND column_name = 'session_json'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE webauthn_challenges ADD COLUMN session_json JSON NULL AFTER type',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
