import type { Dayjs } from 'dayjs';
import type { BudgetStatus, CurrencyCode, Visibility, WorkspaceRole } from './budget';

export type AuthMode = 'login' | 'register';

export interface AuthFormValues {
  displayName?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  defaultCurrency?: string;
}

export interface WorkspaceFormValues {
  name: string;
  type: 'family' | 'team' | 'custom';
  defaultCurrency: string;
}

export interface WorkspaceMemberFormValues {
  email: string;
  role: WorkspaceRole;
}

export interface WorkgroupFormValues {
  name: string;
  description?: string;
}

export interface BudgetFormValues {
  title: string;
  ownerName: string;
  dateRange: [Dayjs, Dayjs];
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  visibility: Visibility;
  status: BudgetStatus;
  note?: string;
}

export interface BudgetItemFormValues {
  categoryId?: number;
  label: string;
  budgetCurrency: CurrencyCode;
  budgetAmount: number;
  budgetRate?: number;
  estimatedCurrency: CurrencyCode;
  estimatedAmount: number;
  estimatedRate?: number;
  sortOrder?: number;
}

export interface TransactionFormValues {
  categoryId?: number;
  transactionDate?: Dayjs;
  details: string;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  remark?: string;
  sortOrder?: number;
}
