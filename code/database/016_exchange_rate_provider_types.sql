ALTER TABLE exchange_rates
  MODIFY provider_rate_type ENUM(
    'manual',
    'mid',
    'card',
    'customer_sell',
    'customer_buy'
  ) NOT NULL DEFAULT 'manual';
