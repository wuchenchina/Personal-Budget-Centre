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
    borderRadius: 0,
    borderRadiusLG: 0,
    borderRadiusSM: 0,
    borderRadiusXS: 0,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#ffffff',
    colorBorder: '#d8d8d8',
    colorBorderSecondary: '#e6e6e6',
    colorError: '#db0011',
    colorInfo: '#db0011',
    colorLink: '#db0011',
    colorPrimary: '#db0011',
    colorSuccess: '#1b7f3a',
    colorText: '#1b1b1b',
    colorTextDescription: '#595959',
    colorTextHeading: '#111111',
    colorTextLabel: '#333333',
    colorWarning: '#a86100',
    controlHeight: 34,
    controlHeightLG: 42,
    controlHeightSM: 28,
    controlOutline: 'rgba(219, 0, 17, 0)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyCode: 'var(--font-mono), "SFMono-Regular", Consolas, monospace',
    fontSize: 14,
    fontWeightStrong: 650,
  },
  components: {
    Button: {
      defaultShadow: 'none',
      defaultHoverBg: '#ffffff',
      defaultHoverBorderColor: '#db0011',
      defaultHoverColor: '#c40010',
      fontWeight: 650,
      primaryColor: '#ffffff',
      primaryShadow: 'none',
      textHoverBg: '#ffffff',
      textTextHoverColor: '#db0011',
    },
    Table: {
      cellFontSizeSM: 12,
      headerBg: '#f0f0f0',
      headerColor: '#333333',
    },
  },
};
