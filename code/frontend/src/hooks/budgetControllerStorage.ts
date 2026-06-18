const SELECTED_BUDGET_STORAGE_KEY = 'budgetCentre.selectedBudgetByWorkspace';

export function selectedBudgetIdForWorkspace(workspaceId: number): number | null {
  const selectedBudgets = selectedBudgetStorage();
  const budgetId = selectedBudgets[String(workspaceId)];

  return Number.isInteger(budgetId) && budgetId > 0 ? budgetId : null;
}

export function rememberSelectedBudgetId(workspaceId: number, budgetId: number): void {
  const selectedBudgets = selectedBudgetStorage();
  selectedBudgets[String(workspaceId)] = budgetId;
  writeSelectedBudgetStorage(selectedBudgets);
}

export function clearSelectedBudgetIdForWorkspace(workspaceId: number): void {
  const selectedBudgets = selectedBudgetStorage();
  delete selectedBudgets[String(workspaceId)];
  writeSelectedBudgetStorage(selectedBudgets);
}

function selectedBudgetStorage(): Record<string, number> {
  try {
    const rawValue = window.localStorage.getItem(SELECTED_BUDGET_STORAGE_KEY);
    if (rawValue === null) {
      return {};
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (parsedValue === null || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedValue)
        .map(([workspaceId, budgetId]) => [workspaceId, Number(budgetId)] as const)
        .filter(([, budgetId]) => Number.isInteger(budgetId) && budgetId > 0),
    );
  } catch {
    return {};
  }
}

function writeSelectedBudgetStorage(selectedBudgets: Record<string, number>): void {
  try {
    window.localStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, JSON.stringify(selectedBudgets));
  } catch {
    // Browsers can block localStorage in private or restricted contexts.
  }
}
