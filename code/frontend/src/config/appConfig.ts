import type { ThemeConfig } from 'antd';
import type { WorkspaceRole } from '../types/budget';
import type { UserStatus } from '../types/auth';

export { currencyOptions, supportedCurrencyCodes } from './currencies';

export const iconSize = 16;

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
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#eef3f4',
    colorBorder: '#d9e3e5',
    colorBorderSecondary: '#e7eef0',
    colorError: '#b42318',
    colorInfo: '#0f766e',
    colorLink: '#0f766e',
    colorPrimary: '#0f766e',
    colorSuccess: '#16803c',
    colorText: '#172033',
    colorTextDescription: '#5f6f75',
    colorTextHeading: '#172033',
    colorTextLabel: '#35464d',
    colorWarning: '#b76100',
    controlHeight: 34,
    controlHeightLG: 42,
    controlHeightSM: 28,
    controlOutline: 'rgba(15, 118, 110, 0.16)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyCode: 'var(--font-mono), "SFMono-Regular", Consolas, monospace',
    fontSize: 14,
    fontWeightStrong: 650,
  },
  components: {
    Button: {
      primaryShadow: '0 10px 20px rgba(15, 118, 110, 0.16)',
    },
    Table: {
      cellFontSizeSM: 12,
      headerBg: '#edf4f4',
      headerColor: '#35464d',
    },
  },
};
