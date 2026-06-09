export type CurrencyCode =
  | 'CNY'
  | 'CNH'
  | 'HKD'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'TWD'
  | 'MOP'
  | 'AUD'
  | 'NZD'
  | 'CAD'
  | 'CHF'
  | 'DKK'
  | 'NOK'
  | 'SEK'
  | 'SGD'
  | 'THB'
  | 'BND'
  | 'ZAR';

export type BudgetStatus = 'draft' | 'active' | 'closed' | 'archived';

export type BudgetType = 'regular' | 'installment';

export type BudgetInstallmentPeriodUnit = 'day' | 'week' | 'month' | 'year';

export type Visibility = 'private' | 'workspace' | 'custom';

export type PrincipalType = 'user' | 'workgroup' | 'workspace';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'auditor';

export type BudgetShareRole = 'owner' | 'editor' | 'viewer' | 'auditor';

export type BudgetSharePrincipalType = PrincipalType;

export interface Money {
  currency: CurrencyCode;
  amount: number;
}

export interface WorkspaceMember {
  id: number;
  name: string;
  email: string;
  role: WorkspaceRole;
}

export interface Workgroup {
  id: number;
  name: string;
  members: string[];
}

export interface ShareGrant {
  id: number;
  principalType: PrincipalType;
  principalName: string;
  role: WorkspaceRole;
  canExport: boolean;
}

export interface BudgetShare {
  id: number;
  budgetId: number;
  principalType: BudgetSharePrincipalType;
  principalId: number;
  principalName: string;
  principalEmail: string | null;
  role: BudgetShareRole;
  canExport: boolean;
  canReshare: boolean;
  expiresAt: string | null;
  createdByUserId: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BudgetSignatureParticipantType = 'workspace_member' | 'manual';
export type BudgetSignatureLabelLanguage = 'en' | 'sc' | 'tc';
export type BudgetSignatureLabelMode = 'confirmation_signature' | 'confirmation' | 'signature';
export type BudgetSignatureLabelSeparator = 'none' | 'space' | 'slash' | 'line';
export type BudgetSignatureSectionAlign = 'full' | 'right';
export type BudgetSignatureLabelAlign = 'left' | 'right';

export interface BudgetSignatureCustomField {
  id: string;
  label: string;
  value: string;
  show: boolean;
}

export interface BudgetSignatureRow {
  id: string;
  participantType: BudgetSignatureParticipantType;
  memberUserId: number | null;
  roleLabel: string;
  displayName: string;
  email: string | null;
  position: string | null;
  signedAt: string | null;
  customFields: BudgetSignatureCustomField[];
  showRole: boolean;
  showName: boolean;
  showEmail: boolean;
  showPosition: boolean;
  showSignature: boolean;
  showDateTime: boolean;
}

export interface BudgetSignatureConfig {
  enabled: boolean;
  title: string;
  infoLanguage: BudgetSignatureLabelLanguage;
  labelLanguage: BudgetSignatureLabelLanguage;
  labelMode: BudgetSignatureLabelMode;
  labelSeparator: BudgetSignatureLabelSeparator;
  sectionAlign: BudgetSignatureSectionAlign;
  labelAlign: BudgetSignatureLabelAlign;
  showControlText: boolean;
  rows: BudgetSignatureRow[];
}

export interface BudgetInstallmentConfig {
  enabled: boolean;
  months: number | null;
  paidMonths: number;
  monthlyAmount: number | null;
  totalAmount: number | null;
  periodAmounts: number[];
  startMonth: string | null;
  periodUnit: BudgetInstallmentPeriodUnit;
  remark: string | null;
}

export interface BudgetItem {
  id: number;
  categoryId: number | null;
  category: string | null;
  label: string;
  budget: {
    currency: CurrencyCode;
    amountOriginal: number;
    rateToBase: number;
    amountBase: number;
  };
  estimatedActuals: {
    currency: CurrencyCode;
    amountOriginal: number;
    rateToBase: number;
    amountBase: number;
  };
  varianceBase: number;
  installmentConfig: BudgetInstallmentConfig;
  sortOrder: number;
}

export interface Transaction {
  id: number;
  categoryId: number | null;
  category: string | null;
  transactionDate: string | null;
  details: string;
  currency: CurrencyCode;
  amountOriginal: number;
  rateToBase: number;
  amountBase: number;
  referenceCurrency: CurrencyCode | null;
  referenceAmountOriginal: number | null;
  remark: string | null;
  sortOrder: number;
}

export interface CurrencyRate {
  id: number;
  workspaceId: number | null;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  source: 'manual' | 'budget_default' | 'bochk' | 'mastercard';
  sourceName: string | null;
  sourceUrl: string | null;
  providerRateType: 'manual' | 'mid' | 'card';
  providerSellRate: number | null;
  providerBuyRate: number | null;
  providerUpdatedAt: string | null;
  fetchedAt: string | null;
  note: string | null;
  rateDate: string;
  createdAt: string;
}

export interface Currency {
  id: number;
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isEnabled: boolean;
}

export interface BudgetCategoryAlias {
  id: number;
  categoryId: number;
  alias: string;
  createdAt: string;
}

export interface BudgetCategory {
  id: number;
  workspaceId: number;
  name: string;
  parentId: number | null;
  defaultCurrency: CurrencyCode | null;
  sortOrder: number;
  isPreset: boolean;
  isActive: boolean;
  aliases: BudgetCategoryAlias[];
}

export type BudgetExportFormat = 'pdf';

export interface BudgetExport {
  id: number;
  budgetId: number;
  userId: number;
  format: BudgetExportFormat;
  fileName: string;
  filePath: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  downloadUrl: string;
}

export interface BudgetTemplateStyle {
  titleFont: string;
  monoFont: string;
  cjkFont: string;
  titleSize: string;
  tableBodySize: string;
  tableTitleSize: string;
  sectionHeaderBg: string;
  columnHeaderBg: string;
}

export interface TemplateColumn {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
  widthPercent: number;
  dataType: 'text' | 'money' | 'date' | 'currency' | 'rate';
}

export interface TemplateSection {
  key: string;
  title: string;
  columns: TemplateColumn[];
}

export interface BudgetTemplateDefinition {
  key: string;
  name: string;
  titleTemplate: string;
  subtitleTemplate: string;
  sections: TemplateSection[];
  style: BudgetTemplateStyle;
}

export interface BudgetTotals {
  totalBudgetBase: number;
  totalEstimatedBase: number;
  totalVarianceBase: number;
  totalTransactionBase: number;
  transactionCount: number;
}

export interface BudgetTemplateRef {
  key: string | null;
  name: string | null;
}

export interface BudgetSummary {
  id: number;
  workspaceId: number;
  title: string;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  budgetType: BudgetType;
  installmentPeriodUnit: BudgetInstallmentPeriodUnit;
  visibility: Visibility;
  status: BudgetStatus;
  note: string | null;
  signatureConfig: BudgetSignatureConfig;
  template: BudgetTemplateRef;
  totals: BudgetTotals;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetDetail extends BudgetSummary {
  items: BudgetItem[];
  transactions: Transaction[];
}

export interface BudgetDocument {
  id: number;
  title: string;
  titleTemplate: string;
  ownerName: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  status: BudgetStatus;
  visibility: Visibility;
  workspace: string;
  ownerRole: WorkspaceRole;
  items: BudgetItem[];
  transactions: Transaction[];
  rates: CurrencyRate[];
  workgroups: Workgroup[];
  members: WorkspaceMember[];
  shares: ShareGrant[];
  templateStyle: BudgetTemplateStyle;
  signatureConfig: BudgetSignatureConfig;
}
