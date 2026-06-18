import { useState } from 'react';
import { convertCurrency } from '../api/exchangeRates';
import type { CurrencyCode } from '../types/budget';
import { useBudgetItemEntryActions } from './useBudgetItemEntryActions';
import { useInstallmentEntryActions } from './useInstallmentEntryActions';
import { useTransactionEntryActions } from './useTransactionEntryActions';
import type { UseBudgetEntryControllerOptions } from './budgetEntryTypes';

export type { BudgetItemModalFocus } from './budgetEntryTypes';

export function useBudgetEntryController(options: UseBudgetEntryControllerOptions) {
  const [entryError, setEntryError] = useState<string | null>(null);

  const resolveRate = async (fromCurrency: CurrencyCode, toCurrency: CurrencyCode): Promise<number> => {
    if (options.selectedBudget === null || fromCurrency === toCurrency) {
      return 1;
    }

    const conversion = await convertCurrency({
      workspaceId: options.selectedBudget.workspaceId,
      fromCurrency,
      toCurrency,
      amount: 1,
    });

    return conversion.rate;
  };

  const budgetItemActions = useBudgetItemEntryActions({
    baseCurrency: options.baseCurrency,
    selectedBudget: options.selectedBudget,
    replaceBudgetDetail: options.replaceBudgetDetail,
    resolveRate,
    setEntryError,
  });
  const transactionActions = useTransactionEntryActions({
    baseCurrency: options.baseCurrency,
    selectedBudget: options.selectedBudget,
    replaceBudgetDetail: options.replaceBudgetDetail,
    resolveRate,
    setEntryError,
  });
  const installmentActions = useInstallmentEntryActions({
    selectedBudget: options.selectedBudget,
    replaceBudgetDetail: options.replaceBudgetDetail,
    setEntryError,
  });

  const clearEntryError = () => {
    setEntryError(null);
  };

  return {
    ...budgetItemActions,
    ...transactionActions,
    ...installmentActions,
    entryError,
    isBudgetItemSaving: budgetItemActions.isBudgetItemSaving || installmentActions.isInstallmentSaving,
    clearEntryError,
  };
}

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
