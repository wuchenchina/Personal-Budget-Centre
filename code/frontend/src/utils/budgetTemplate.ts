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
import { translateCurrent } from '../i18n';
import { installmentSummary } from './budgetInstallments';

export function formatBudgetMoney(currency: CurrencyCode, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export interface EffectiveBudgetItemAmounts {
  budgetAmountOriginal: number;
  budgetAmountBase: number;
  estimatedAmountOriginal: number;
  estimatedAmountBase: number;
  varianceBase: number;
}

export function effectiveBudgetItemAmounts(
  item: BudgetItem,
  transactions: Transaction[],
): EffectiveBudgetItemAmounts {
  if (item.budget.amountOriginal !== 0 || item.budget.amountBase !== 0) {
    return {
      budgetAmountOriginal: item.budget.amountOriginal,
      budgetAmountBase: item.budget.amountBase,
      estimatedAmountOriginal: item.estimatedActuals.amountOriginal,
      estimatedAmountBase: item.estimatedActuals.amountBase,
      varianceBase: item.varianceBase,
    };
  }

  const sameCategoryTransactions = transactions.filter((transaction) =>
    item.categoryId === null
      ? transaction.categoryId === null && transaction.category === item.label
      : transaction.categoryId === item.categoryId,
  );
  if (sameCategoryTransactions.length === 0) {
    return {
      budgetAmountOriginal: item.budget.amountOriginal,
      budgetAmountBase: item.budget.amountBase,
      estimatedAmountOriginal: item.estimatedActuals.amountOriginal,
      estimatedAmountBase: item.estimatedActuals.amountBase,
      varianceBase: item.varianceBase,
    };
  }

  const allSameBudgetCurrency = sameCategoryTransactions.every(
    (transaction) => transaction.currency === item.budget.currency,
  );
  const originalTotal = allSameBudgetCurrency
    ? sameCategoryTransactions.reduce((total, transaction) => total + transaction.amountOriginal, 0)
    : item.budget.amountOriginal;
  const baseTotal = sameCategoryTransactions.reduce(
    (total, transaction) => total + transaction.amountBase,
    0,
  );

  return {
    budgetAmountOriginal: allSameBudgetCurrency ? roundMoney(originalTotal) : item.budget.amountOriginal,
    budgetAmountBase: roundMoney(baseTotal),
    estimatedAmountOriginal: allSameBudgetCurrency
      ? roundMoney(originalTotal)
      : item.estimatedActuals.amountOriginal,
    estimatedAmountBase: roundMoney(baseTotal),
    varianceBase: 0,
  };
}

export function effectiveBudgetTotals(budget: BudgetDetail) {
  return budget.items.reduce(
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
}

export function createBudgetItemColumns(
  columns: TemplateColumn[],
  baseCurrency: CurrencyCode,
  transactions: Transaction[] = [],
): TableProps<BudgetItem>['columns'] {
  return columns.map((column) => ({
    key: column.key,
    title: column.label,
    align: column.align,
    render: (_: unknown, row: BudgetItem) => {
      if (column.key === 'category') {
        return createElement(
          'div',
          { className: 'budget-item-category-cell' },
          createElement('span', null, row.category ?? row.label),
          budgetInstallmentSummary(row),
        );
      }

      const effective = effectiveBudgetItemAmounts(row, transactions);

      if (column.key === 'budget') {
        return formatBudgetMoney(row.budget.currency, effective.budgetAmountOriginal);
      }

      if (column.key === 'estimated_actuals') {
        return formatBudgetMoney(row.estimatedActuals.currency, effective.estimatedAmountOriginal);
      }

      if (column.key === 'variance') {
        return formatBudgetMoney(baseCurrency, effective.varianceBase);
      }

      return '';
    },
    width: `${column.widthPercent}%`,
  }));
}

function budgetInstallmentSummary(row: BudgetItem) {
  const summary = installmentSummary(row.installmentConfig);
  if (!summary.isEnabled || summary.monthlyAmount === null || row.installmentConfig.months === null) {
    return null;
  }

  return createElement(
    'span',
    { className: 'budget-installment-summary' },
    `${translateCurrent('installment')}: ${translateCurrent('installmentSummary', {
        amount: formatBudgetMoney(row.budget.currency, summary.monthlyAmount),
        paid: row.installmentConfig.paidMonths,
        months: row.installmentConfig.months,
      })}${
        summary.remainingMonths === null
          ? ''
          : ` · ${translateCurrent('installmentRemaining', { count: summary.remainingMonths })}`
      }`,
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
