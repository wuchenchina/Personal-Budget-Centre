import type { Dayjs } from 'dayjs';
import type { PdfExportSettings } from './auth';
import type {
  BudgetInstallmentConfig,
  BudgetInstallmentDisplayMode,
  BudgetInstallmentPeriodUnit,
  BudgetItemPricingConfig,
  BudgetItemSplitType,
  BudgetParticipant,
  BudgetParticipantMode,
  BudgetSignatureConfig,
  BudgetStatus,
  BudgetType,
  CurrencyCode,
  PdfThemeKey,
  TransactionType,
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
  individualAmounts?: Array<{
    participantId: number;
    amountBase?: number | null;
  }>;
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
  defaultCurrency?: string | null;
}

export interface WorkspaceEditFormValues {
  name: string;
  type: 'personal' | 'family' | 'team' | 'custom';
  defaultCurrency?: string | null;
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
  pricingEnabled: boolean;
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
  budgetTargetBaseAmount?: number;
  rateScope?: 'item' | 'budget_default';
  bankFee?: number;
  pricingConfig?: BudgetItemPricingConfig;
  installmentConfig?: BudgetInstallmentFormConfig;
  split?: BudgetItemSplitFormValue;
  sortOrder?: number;
}

export interface TransactionFormValues {
  categoryId?: number;
  paymentMode?: 'single' | 'multiple';
  paidByParticipantId?: number | null;
  payments?: Array<{
    participantId?: number;
    amount?: number | null;
  }>;
  transactionDate?: Dayjs;
  details: string;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  targetBaseAmount?: number;
  rateScope?: 'item' | 'budget_default';
  pricingConfig?: BudgetItemPricingConfig;
  referenceCurrency?: CurrencyCode;
  referenceAmount?: number;
  remark?: string;
  sortOrder?: number;
}

export interface BookkeepingRecordFormValues {
  transactionType?: TransactionType;
  recordDate?: Dayjs;
  orderReference?: string;
  details: string;
  categoryLabel?: string;
  sourceAccountName?: string;
  destinationAccountName?: string;
  currency: CurrencyCode;
  amount: number;
  rate?: number;
  targetBaseAmount?: number;
  rateScope?: 'item' | 'budget_default';
  destinationCurrency?: CurrencyCode;
  destinationAmount?: number;
  destinationRate?: number;
  remark?: string;
  sortOrder?: number;
}

export interface ProfileFormValues {
  displayName: string;
  defaultCurrency?: CurrencyCode | null;
  defaultPdfTheme: PdfThemeKey;
  pdfExportSettings: PdfExportSettings;
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
