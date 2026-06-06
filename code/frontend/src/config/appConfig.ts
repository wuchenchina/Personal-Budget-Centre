import type { ThemeConfig } from 'antd';
import type {
  BudgetSharePrincipalType,
  BudgetShareRole,
  BudgetStatus,
  CurrencyCode,
  WorkspaceRole,
} from '../types/budget';
import type { UserStatus } from '../types/auth';

export const iconSize = 16;

export const supportedCurrencyCodes: CurrencyCode[] = [
  'CNY',
  'CNH',
  'HKD',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'TWD',
  'MOP',
  'AUD',
  'NZD',
  'CAD',
  'CHF',
  'DKK',
  'NOK',
  'SEK',
  'SGD',
  'THB',
  'BND',
  'ZAR',
];

export const roleColors: Record<WorkspaceRole, string> = {
  owner: 'gold',
  admin: 'red',
  editor: 'blue',
  viewer: 'default',
  auditor: 'purple',
};

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: '所有者',
  admin: '管理员',
  editor: '编辑者',
  viewer: '查看者',
  auditor: '审计员',
};

export const budgetShareRoleLabels: Record<BudgetShareRole, string> = {
  owner: '所有者',
  editor: '编辑者',
  viewer: '查看者',
  auditor: '审计员',
};

export const principalTypeLabels: Record<BudgetSharePrincipalType, string> = {
  user: '用户',
  workgroup: '工作组',
  workspace: '工作区',
};

export const budgetStatusLabels: Record<BudgetStatus, string> = {
  draft: '草稿',
  active: '启用',
  closed: '关闭',
  archived: '归档',
};

export const userStatusLabels: Record<UserStatus, string> = {
  active: '正常',
  pending: '待验证',
  disabled: '已停用',
};

export const userStatusColors: Record<UserStatus, string> = {
  active: 'blue',
  pending: 'orange',
  disabled: 'default',
};

export const currencyOptions = supportedCurrencyCodes.map((code) => ({
  label: code,
  value: code,
}));

export const workspaceTypeOptions = [
  { label: '家庭', value: 'family' },
  { label: '团队', value: 'team' },
  { label: '自定义', value: 'custom' },
];

export const assignableWorkspaceRoleOptions = [
  { label: roleLabels.admin, value: 'admin' },
  { label: roleLabels.editor, value: 'editor' },
  { label: roleLabels.viewer, value: 'viewer' },
  { label: roleLabels.auditor, value: 'auditor' },
];

export const budgetShareRoleOptions: Array<{ label: string; value: BudgetShareRole }> = [
  { label: budgetShareRoleLabels.editor, value: 'editor' },
  { label: budgetShareRoleLabels.viewer, value: 'viewer' },
  { label: budgetShareRoleLabels.auditor, value: 'auditor' },
];

export const defaultBudgetTotals = {
  totalBudgetBase: 0,
  totalEstimatedBase: 0,
  totalVarianceBase: 0,
  totalTransactionBase: 0,
  transactionCount: 0,
};

export const appTheme: ThemeConfig = {
  token: {
    borderRadius: 8,
    colorPrimary: '#1677ff',
    colorInfo: '#1677ff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Table: {
      cellFontSizeSM: 12,
      headerBg: '#f5f7fa',
    },
  },
};
