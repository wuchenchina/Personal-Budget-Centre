import { apiGet } from './http';
import type { BudgetReconciliationRow } from '../types/budget';

interface ReconciliationResponse {
  reconciliation: BudgetReconciliationRow[];
}

export function getBudgetReconciliation(budgetId: number): Promise<BudgetReconciliationRow[]> {
  return apiGet<ReconciliationResponse>(`/api/budget-reconciliation?budgetId=${budgetId}`).then(
    (payload) => payload.reconciliation,
  );
}
