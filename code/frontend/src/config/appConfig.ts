import type { ThemeConfig } from 'antd';
import type { BudgetStatus, CurrencyRate, TransactionType, WorkspaceRole } from '../types/budget';
import type { UserStatus } from '../types/auth';

export const iconSize = 16;

export const roleColors: Record<WorkspaceRole, string> = {
  owner: 'red',
  admin: 'red',
  editor: 'default',
  viewer: 'default',
  auditor: 'default',
};

export const userStatusColors: Record<UserStatus, string> = {
  active: 'green',
  pending: 'orange',
  disabled: 'default',
};

export const budgetStatusColors: Record<BudgetStatus, string> = {
  draft: 'default',
  active: 'green',
  closed: 'default',
  archived: 'default',
};

export const transactionTypeColors: Record<TransactionType, string> = {
  expense: 'default',
  income: 'green',
  sof: 'orange',
  transfer: 'default',
  fx_exchange: 'default',
  cross_border_remittance: 'default',
};

export const currencyRateSourceColors: Record<CurrencyRate['source'], string> = {
  manual: 'orange',
  budget_default: 'default',
  bank_reference: 'red',
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
    boxShadow: '0 8px 20px rgba(17, 17, 17, 0.12)',
    boxShadowSecondary: '0 6px 16px rgba(17, 17, 17, 0.08)',
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
    Input: {
      activeBg: '#ffffff',
      activeBorderColor: '#8f8f8f',
      activeShadow: '0 0 0 3px rgba(17, 17, 17, 0.06)',
      hoverBg: '#ffffff',
      hoverBorderColor: '#b7b7b7',
      paddingInline: 11,
    },
    Table: {
      cellFontSizeSM: 12,
      borderColor: '#e6e6e6',
      headerBg: '#f3f3f3',
      headerColor: '#1b1b1b',
      rowHoverBg: '#fafafa',
    },
    Tag: {
      defaultBg: '#ffffff',
      defaultColor: '#555555',
    },
  },
};
