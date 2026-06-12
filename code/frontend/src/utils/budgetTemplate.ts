import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { createElement } from 'react';
import { supportedCurrencyCodes } from '../config/appConfig';
import type {
  BudgetDetail,
  BudgetItem,
  CurrencyCode,
  TemplateColumn,
  Transaction,
} from '../types/budget';

export function formatBudgetMoney(currency: CurrencyCode, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export interface EffectiveBudgetItemAmounts {
  budgetAmountOriginal: number;
  budgetAmountBase: number;
  estimatedAmountOriginal: number;
  estimatedAmountBase: number;
  estimatedTransactionTotals: TransactionCurrencyTotal[];
  hasTransactionActuals: boolean;
  varianceBase: number;
}

export interface TransactionCurrencyTotal {
  currency: CurrencyCode;
  amountOriginal: number;
  amountBase: number;
}

export function budgetItemAmountMultiplier(item: BudgetItem): number {
  if (item.split?.splitType !== 'per_person') {
    return 1;
  }

  const includedCount = item.split.participants.filter((participant) => participant.isIncluded).length;

  return Math.max(1, includedCount);
}

export function effectiveBudgetItemAmounts(
  item: BudgetItem,
  transactions: Transaction[],
): EffectiveBudgetItemAmounts {
  const amountMultiplier = budgetItemAmountMultiplier(item);
  const transactionTotals = transactionCurrencyTotalsForItem(item, transactions)
    .map((total) => ({
      ...total,
      amountOriginal: roundMoney(total.amountOriginal * amountMultiplier),
      amountBase: roundMoney(total.amountBase * amountMultiplier),
    }));
  const transactionBaseTotal = roundMoney(
    transactionTotals.reduce((total, transaction) => total + transaction.amountBase, 0),
  );
  const hasTransactionActuals = transactionTotals.length > 0;
  const shouldUseTransactionsAsBudget =
    item.budget.amountOriginal === 0 && item.budget.amountBase === 0 && hasTransactionActuals;
  const budgetAmountBase = shouldUseTransactionsAsBudget
    ? transactionBaseTotal
    : roundMoney(item.budget.amountBase * amountMultiplier);
  const budgetAmountOriginal = shouldUseTransactionsAsBudget
    ? originalAmountFromBase(budgetAmountBase, item.budget.rateToBase)
    : roundMoney(item.budget.amountOriginal * amountMultiplier);
  const estimatedAmountBase = hasTransactionActuals ? transactionBaseTotal : 0;
  const estimatedAmountOriginal =
    transactionTotals.length === 1 ? transactionTotals[0].amountOriginal : estimatedAmountBase;

  return {
    budgetAmountOriginal,
    budgetAmountBase,
    estimatedAmountOriginal,
    estimatedAmountBase,
    estimatedTransactionTotals: transactionTotals,
    hasTransactionActuals,
    varianceBase: roundMoney(budgetAmountBase - estimatedAmountBase),
  };
}

export function transactionCurrencyTotalsForItem(
  item: BudgetItem,
  transactions: Transaction[],
): TransactionCurrencyTotal[] {
  const sameCategoryTransactions = transactions.filter((transaction) =>
    item.categoryId === null
      ? transaction.categoryId === null && transaction.category === item.label
      : transaction.categoryId === item.categoryId,
  );
  const totals = new Map<CurrencyCode, TransactionCurrencyTotal>();

  sameCategoryTransactions.forEach((transaction) => {
    const current = totals.get(transaction.currency) ?? {
      currency: transaction.currency,
      amountOriginal: 0,
      amountBase: 0,
    };

    totals.set(transaction.currency, {
      currency: transaction.currency,
      amountOriginal: current.amountOriginal + transaction.amountOriginal,
      amountBase: current.amountBase + transaction.amountBase,
    });
  });

  return Array.from(totals.values())
    .map((total) => ({
      ...total,
      amountOriginal: roundMoney(total.amountOriginal),
      amountBase: roundMoney(total.amountBase),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export function effectiveBudgetTotals(budget: BudgetDetail) {
  const totals = budget.items.reduce(
    (totals, item) => {
      const effective = effectiveBudgetItemAmounts(item, budget.transactions);

      return {
        totalBudgetBase: totals.totalBudgetBase + effective.budgetAmountBase,
        totalEstimatedBase: totals.totalEstimatedBase + effective.estimatedAmountBase,
        totalVarianceBase: totals.totalVarianceBase + effective.varianceBase,
      };
    },
    { totalBudgetBase: 0, totalEstimatedBase: 0, totalVarianceBase: 0 },
  );

  return {
    totalBudgetBase: roundMoney(totals.totalBudgetBase),
    totalEstimatedBase: roundMoney(totals.totalEstimatedBase),
    totalVarianceBase: roundMoney(totals.totalVarianceBase),
  };
}

export function createBudgetItemColumns(
  columns: TemplateColumn[],
  baseCurrency: CurrencyCode,
  transactions: Transaction[] = [],
  pricingEnabled = true,
): TableProps<BudgetItem>['columns'] {
  return columns.map((column) => ({
    key: column.key,
    title: column.label,
    align: column.align,
    render: (_: unknown, row: BudgetItem) => {
      if (column.key === 'category') {
        const pricingSummary = pricingEnabled ? pricingSummaryForItem(row) : null;

        return createElement(
          'div',
          { className: 'budget-item-category-cell' },
          createElement('span', null, row.category ?? row.label),
          pricingSummary === null
            ? null
            : createElement('small', { className: 'budget-money-secondary' }, pricingSummary),
        );
      }

      const effective = effectiveBudgetItemAmounts(row, transactions);

      if (column.key === 'budget') {
        return createMoneyWithSecondary(
          baseCurrency,
          effective.budgetAmountBase,
          row.budget.currency,
          row.budget.rateToBase,
        );
      }

      if (column.key === 'estimated_actuals') {
        return createMoneyWithBreakdown(
          baseCurrency,
          effective.estimatedAmountBase,
          effective.estimatedTransactionTotals,
        );
      }

      if (column.key === 'variance') {
        return formatBudgetMoney(baseCurrency, effective.varianceBase);
      }

      return '';
    },
    width: `${column.widthPercent}%`,
  }));
}

function pricingSummaryForItem(item: BudgetItem): string | null {
  if (!item.pricingConfig.enabled || item.pricingConfig.totalAmount === null) {
    return null;
  }

  const unitPrice = item.pricingConfig.unitPrice;
  const quantity = item.pricingConfig.quantity;
  if (unitPrice === null || quantity === null) {
    return null;
  }

  return `${formatBudgetMoney(item.budget.currency, unitPrice)} x ${quantity} = ${formatBudgetMoney(
    item.budget.currency,
    item.pricingConfig.totalAmount,
  )}`;
}

function createMoneyWithSecondary(
  primaryCurrency: CurrencyCode,
  primaryAmount: number,
  secondaryCurrency: CurrencyCode,
  rateToBase: number,
) {
  if (secondaryCurrency === primaryCurrency || rateToBase <= 0) {
    return formatBudgetMoney(primaryCurrency, primaryAmount);
  }

  return createElement(
    'div',
    { className: 'budget-money-stack' },
    createElement('span', null, formatBudgetMoney(primaryCurrency, primaryAmount)),
    createElement(
      'span',
      { className: 'budget-money-secondary' },
      formatBudgetMoney(secondaryCurrency, primaryAmount / rateToBase),
    ),
  );
}

function createMoneyWithBreakdown(
  primaryCurrency: CurrencyCode,
  primaryAmount: number,
  transactionTotals: TransactionCurrencyTotal[],
) {
  const primary = formatBudgetMoney(primaryCurrency, primaryAmount);
  const secondaryTotals =
    transactionTotals.length === 1 && transactionTotals[0].currency === primaryCurrency
      ? []
      : transactionTotals;
  if (secondaryTotals.length === 0) {
    return primary;
  }

  return createElement(
    'div',
    { className: 'budget-money-stack' },
    createElement('span', null, primary),
    ...secondaryTotals.map((total) =>
      createElement(
        'span',
        { className: 'budget-money-secondary', key: total.currency },
        formatBudgetMoney(total.currency, total.amountOriginal),
      ),
    ),
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function originalAmountFromBase(amountBase: number, rateToBase: number): number {
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) {
    return roundMoney(amountBase);
  }

  return roundMoney(amountBase / rateToBase);
}

export function createTransactionColumns(
  columns: TemplateColumn[],
): TableProps<Transaction>['columns'] {
  return columns.map((column) => ({
    key: column.key,
    title: column.label,
    align: column.align,
    render: (_: unknown, row: Transaction) => {
      if (column.key === 'transaction_details') {
        return row.details;
      }

      if (column.key === 'category') {
        return row.category ?? '';
      }

      if (column.key === 'amount') {
        return formatBudgetMoney(row.currency, row.amountOriginal);
      }

      if (column.key === 'remark') {
        return row.remark ?? '';
      }

      return '';
    },
    width: `${column.widthPercent}%`,
  }));
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return supportedCurrencyCodes.includes(value as CurrencyCode);
}

export function toCurrencyCode(value: string | undefined): CurrencyCode {
  const normalized = (value ?? 'CNY').trim().toUpperCase();

  return isCurrencyCode(normalized) ? normalized : 'CNY';
}

export function renderBudgetTemplateText(templateText: string, budget: BudgetDetail): string {
  const start = budget.startDate === null ? null : dayjs(budget.startDate);
  const end = budget.endDate === null ? null : dayjs(budget.endDate);
  const replacements: Record<string, string> = {
    '{{budget_title}}': budget.title,
    '{{owner_name}}': budget.ownerName,
    '{{period_start}}': budget.startDate ?? '',
    '{{period_end}}': budget.endDate ?? '',
    '{{period_start_title}}': start?.isValid() ? start.format('MMMM D, YYYY') : budget.startDate ?? '',
    '{{period_end_title}}': end?.isValid() ? end.format('MMMM D, YYYY') : budget.endDate ?? '',
    '{{year}}': start?.isValid() ? start.format('YYYY') : '',
  };

  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    templateText,
  );
}
