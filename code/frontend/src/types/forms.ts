import type { Dayjs } from 'dayjs';
import type {
  BudgetInstallmentConfig,
  BudgetInstallmentDisplayMode,
  BudgetInstallmentPeriodUnit,
  BudgetItemSplitType,
  BudgetParticipant,
  BudgetParticipantMode,
  BudgetSignatureConfig,
  BudgetStatus,
  BudgetType,
  CurrencyCode,
  Visibility,
  WorkspaceRole,
} from './budget';

export type BudgetSignatureFormRow = Omit<BudgetSignatureConfig['rows'][number], 'signedAt'> & {
  signedAt?: Dayjs | null;
};

export type BudgetInstallmentFormConfig = Omit<BudgetInstallmentConfig, 'startMonth'> & {
  startMonth?: Dayjs | null;
};

export interface BudgetItemSplitFormValue {
  paidByParticipantId?: number | null;
  splitType: BudgetItemSplitType;
  participantIds?: number[];
  note?: string | null;
}

export type AuthMode = 'login' | 'register';

export interface AuthFormValues {
  identifier?: string;
  username?: string;
  displayName?: string;
  email?: string;
  password: string;
  confirmPassword?: string;
  defaultCurrency?: string;
}

export interface WorkspaceFormValues {
  name: string;
  type: 'family' | 'team' | 'custom';
  defaultCurrency: string;
}

export interface WorkspaceEditFormValues {
  name: string;
  type: 'personal' | 'family' | 'team' | 'custom';
  defaultCurrency: string;
}

export interface WorkspaceMemberFormValues {
  email: string;
  role: WorkspaceRole;
}

export interface BudgetFormValues {
  workspaceId: number;
  title: string;
  ownerName?: string;
  dateRange?: [Dayjs, Dayjs] | null;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  budgetType: BudgetType;
  participantMode: BudgetParticipantMode;
  participants?: Array<Partial<BudgetParticipant>>;
  installmentDisplayMode: BudgetInstallmentDisplayMode;
  installmentPeriodUnit: BudgetInstallmentPeriodUnit;
  visibility: Visibility;
  status: BudgetStatus;
  note?: string;
  signatureConfig?: Omit<BudgetSignatureConfig, 'rows'> & {
    rows: BudgetSignatureFormRow[];
  };
}

export interface BudgetItemFormValues {
  categoryId?: number;
  label: string;
  budgetCurrency: CurrencyCode;
  budgetAmount?: number;
  budgetRate?: number;
  bankFee?: number;
  installmentConfig?: BudgetInstallmentFormConfig;
  split?: BudgetItemSplitFormValue;
  sortOrder?: number;
}

export interface TransactionFormValues {
  categoryId?: number;
  transactionDate?: Dayjs;
  details: string;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  referenceCurrency?: CurrencyCode;
  referenceAmount?: number;
  remark?: string;
  sortOrder?: number;
}

export interface ProfileFormValues {
  displayName: string;
}

export interface EmailChangeFormValues {
  email: string;
  confirmEmail: string;
}

export interface PasswordFormValues {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}
