import type { ThemeConfig } from 'antd';
import type { CurrencyCode, WorkspaceRole } from '../types/budget';

export const iconSize = 16;

export const supportedCurrencyCodes: CurrencyCode[] = [
  'CNY',
  'HKD',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'TWD',
  'MOP',
];

export const roleColors: Record<WorkspaceRole, string> = {
  owner: 'gold',
  admin: 'red',
  editor: 'blue',
  viewer: 'default',
  auditor: 'purple',
};

export const currencyOptions = supportedCurrencyCodes.map((code) => ({
  label: code,
  value: code,
}));

export const workspaceTypeOptions = [
  { label: 'Family', value: 'family' },
  { label: 'Team', value: 'team' },
  { label: 'Custom', value: 'custom' },
];

export const assignableWorkspaceRoleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
  { label: 'Viewer', value: 'viewer' },
  { label: 'Auditor', value: 'auditor' },
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
    colorPrimary: '#2f7d68',
    colorInfo: '#2f7d68',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Table: {
      cellFontSizeSM: 12,
      headerBg: '#f0f2ef',
    },
  },
};
