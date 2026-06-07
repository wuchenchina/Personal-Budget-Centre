import type { ThemeConfig } from 'antd';
import type { CurrencyCode, WorkspaceRole } from '../types/budget';
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

export const userStatusColors: Record<UserStatus, string> = {
  active: 'blue',
  pending: 'orange',
  disabled: 'default',
};

export const currencyOptions = supportedCurrencyCodes.map((code) => ({
  label: code,
  value: code,
}));

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
