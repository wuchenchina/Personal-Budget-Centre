SET NAMES utf8mb4;

INSERT INTO currencies (code, name, symbol, decimal_places, is_enabled)
VALUES
  ('CNY', 'Chinese Yuan', '¥', 2, 1),
  ('CNH', 'Offshore Chinese Yuan', 'CNH¥', 2, 1),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2, 1),
  ('USD', 'United States Dollar', '$', 2, 1),
  ('EUR', 'Euro', '€', 2, 1),
  ('GBP', 'Pound Sterling', '£', 2, 1),
  ('JPY', 'Japanese Yen', '¥', 0, 1),
  ('TWD', 'New Taiwan Dollar', 'NT$', 2, 1),
  ('MOP', 'Macanese Pataca', 'MOP$', 2, 1),
  ('AUD', 'Australian Dollar', 'A$', 2, 1),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2, 1),
  ('CAD', 'Canadian Dollar', 'C$', 2, 1),
  ('CHF', 'Swiss Franc', 'CHF', 2, 1),
  ('DKK', 'Danish Krone', 'DKK', 2, 1),
  ('NOK', 'Norwegian Krone', 'NOK', 2, 1),
  ('SEK', 'Swedish Krona', 'SEK', 2, 1),
  ('SGD', 'Singapore Dollar', 'S$', 2, 1),
  ('THB', 'Thai Baht', '฿', 2, 1),
  ('BND', 'Brunei Dollar', 'B$', 2, 1),
  ('ZAR', 'South African Rand', 'R', 2, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  symbol = VALUES(symbol),
  decimal_places = VALUES(decimal_places),
  is_enabled = VALUES(is_enabled);

INSERT INTO roles (role_key, name, scope, is_system)
VALUES
  ('owner', 'Owner', 'workspace', 1),
  ('admin', 'Admin', 'workspace', 1),
  ('editor', 'Editor', 'workspace', 1),
  ('viewer', 'Viewer', 'workspace', 1),
  ('auditor', 'Auditor', 'workspace', 1),
  ('owner', 'Owner', 'budget', 1),
  ('editor', 'Editor', 'budget', 1),
  ('viewer', 'Viewer', 'budget', 1),
  ('auditor', 'Auditor', 'budget', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_system = VALUES(is_system);

INSERT INTO permissions (permission_key, description)
VALUES
  ('workspace.read', 'Read workspace'),
  ('workspace.update', 'Update workspace settings'),
  ('workspace.members.manage', 'Manage workspace members'),
  ('workgroup.manage', 'Manage workgroups'),
  ('budget.create', 'Create budgets'),
  ('budget.read', 'Read budgets'),
  ('budget.update', 'Update budgets'),
  ('budget.delete', 'Delete budgets'),
  ('budget.owner.transfer', 'Transfer budget ownership'),
  ('budget.share.manage', 'Manage budget sharing'),
  ('category.manage', 'Manage categories'),
  ('transaction.read', 'Read transactions'),
  ('transaction.write', 'Create and update transactions'),
  ('currency.manage', 'Manage currencies'),
  ('exchange_rate.manage', 'Manage exchange rates'),
  ('template.manage', 'Manage templates'),
  ('export.create', 'Create exports'),
  ('audit.read', 'Read audit logs')
ON DUPLICATE KEY UPDATE
  description = VALUES(description);
