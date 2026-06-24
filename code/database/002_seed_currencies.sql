SET NAMES utf8mb4;

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
