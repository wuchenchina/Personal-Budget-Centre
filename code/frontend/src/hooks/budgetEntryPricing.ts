import type { BudgetDetail, BudgetItem, Transaction } from '../types/budget';
import type { BudgetItemFormValues, TransactionFormValues } from '../types/forms';
import { normalizedNonNegativeAmount, roundMoney } from './budgetEntryMath';

export function emptyPricingConfig(): BudgetItem['pricingConfig'] {
  return {
    enabled: false,
    unitPrice: null,
    quantity: null,
    totalAmount: null,
  };
}

export function pricingConfigForBudget(
  budget: BudgetDetail,
  config: BudgetItem['pricingConfig'],
): BudgetItem['pricingConfig'] {
  return budget.pricingEnabled ? config : emptyPricingConfig();
}

export function pricingConfigFromForm(
  config: BudgetItemFormValues['pricingConfig'],
  pricingEnabled: boolean,
): BudgetItem['pricingConfig'] {
  if (!pricingEnabled || config?.enabled !== true) {
    return emptyPricingConfig();
  }

  const unitPrice = normalizedNonNegativeAmount(config.unitPrice);
  const quantity = normalizedNonNegativeAmount(config.quantity);
  const totalAmount = unitPrice === null || quantity === null
    ? null
    : roundMoney(unitPrice * quantity);

  return {
    enabled: true,
    unitPrice,
    quantity,
    totalAmount,
  };
}

export function pricingTotalFromForm(
  config: BudgetItemFormValues['pricingConfig'],
  pricingEnabled: boolean,
): number | null {
  const pricingConfig = pricingConfigFromForm(config, pricingEnabled);

  return pricingConfig.enabled ? pricingConfig.totalAmount : null;
}

export function transactionPricingConfigForCreateForm(
  budget: BudgetDetail,
): BudgetItem['pricingConfig'] {
  return budget.pricingEnabled
    ? {
        enabled: true,
        unitPrice: null,
        quantity: 1,
        totalAmount: null,
      }
    : emptyPricingConfig();
}

export function transactionPricingConfigForEditForm(
  transaction: Transaction,
  budget: BudgetDetail | null,
): BudgetItem['pricingConfig'] {
  if (budget?.pricingEnabled !== true) {
    return emptyPricingConfig();
  }

  if (
    transaction.pricingConfig.enabled
    && transaction.pricingConfig.unitPrice !== null
    && transaction.pricingConfig.quantity !== null
  ) {
    return transaction.pricingConfig;
  }

  const unitPrice = transaction.pricingConfig.enabled && transaction.pricingConfig.unitPrice !== null
    ? transaction.pricingConfig.unitPrice
    : transaction.amountOriginal;
  const quantity = transaction.pricingConfig.enabled && transaction.pricingConfig.quantity !== null
    ? transaction.pricingConfig.quantity
    : 1;

  return {
    enabled: true,
    unitPrice,
    quantity,
    totalAmount: roundMoney(unitPrice * quantity),
  };
}

export function transactionPricingConfigForBudget(
  budget: BudgetDetail,
  transaction: Transaction,
): BudgetItem['pricingConfig'] {
  return transactionPricingConfigForEditForm(transaction, budget);
}

export function transactionPricingConfigWithChange(
  transaction: Transaction,
  budget: BudgetDetail,
  change: { unitPrice?: number; quantity?: number },
): BudgetItem['pricingConfig'] {
  if (!budget.pricingEnabled) {
    return emptyPricingConfig();
  }

  const current = transactionPricingConfigForEditForm(transaction, budget);
  const unitPrice = normalizedNonNegativeAmount(change.unitPrice ?? current.unitPrice);
  const quantity = normalizedNonNegativeAmount(change.quantity ?? current.quantity ?? 1);
  const totalAmount = unitPrice === null || quantity === null
    ? null
    : roundMoney(unitPrice * quantity);

  return {
    enabled: true,
    unitPrice,
    quantity,
    totalAmount,
  };
}

export function transactionPricingConfigFromForm(
  config: TransactionFormValues['pricingConfig'],
  pricingEnabled: boolean,
): BudgetItem['pricingConfig'] {
  if (!pricingEnabled) {
    return emptyPricingConfig();
  }

  const unitPrice = normalizedNonNegativeAmount(config?.unitPrice);
  const quantity = normalizedNonNegativeAmount(config?.quantity ?? 1);
  const totalAmount = unitPrice === null || quantity === null
    ? null
    : roundMoney(unitPrice * quantity);

  return {
    enabled: true,
    unitPrice,
    quantity,
    totalAmount,
  };
}

export function transactionPricingTotalFromForm(
  config: TransactionFormValues['pricingConfig'],
  pricingEnabled: boolean,
): number | null {
  const pricingConfig = transactionPricingConfigFromForm(config, pricingEnabled);

  return pricingConfig.enabled ? pricingConfig.totalAmount : null;
}
