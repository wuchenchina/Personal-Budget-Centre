import type { BudgetDetail, CurrencyCode } from '../types/budget';

export type BudgetItemModalFocus = 'category' | 'budget' | 'estimated_actuals' | 'variance' | null;

export interface UseBudgetEntryControllerOptions {
  baseCurrency: CurrencyCode;
  selectedBudget: BudgetDetail | null;
  replaceBudgetDetail: (budget: BudgetDetail) => void;
}
