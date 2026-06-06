export type CurrencyCode = 'CNY' | 'HKD' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'TWD' | 'MOP';

export type BudgetStatus = 'draft' | 'active' | 'closed' | 'archived';

export type Visibility = 'private' | 'workspace' | 'custom';

export type PrincipalType = 'user' | 'workgroup' | 'workspace';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'auditor';

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
  remark: string | null;
  sortOrder: number;
}

export interface CurrencyRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  source: 'manual' | 'budget_default' | 'future_live_provider';
  rateDate: string;
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
  isActive: boolean;
  aliases: BudgetCategoryAlias[];
}

export interface BudgetReconciliationRow {
  budgetId: number;
  categoryId: number | null;
  category: string | null;
  label: string;
  estimatedAmountBase: number;
  transactionTotalBase: number;
  differenceBase: number;
}

export type BudgetExportFormat = 'markdown' | 'docx' | 'pdf';

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
  startDate: string;
  endDate: string;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  visibility: Visibility;
  status: BudgetStatus;
  note: string | null;
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
  startDate: string;
  endDate: string;
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
}
