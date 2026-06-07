import type { TableProps } from 'antd';
import dayjs from 'dayjs';
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

export function createBudgetItemColumns(
  columns: TemplateColumn[],
  baseCurrency: CurrencyCode,
): TableProps<BudgetItem>['columns'] {
  return columns.map((column) => ({
    key: column.key,
    title: column.label,
    align: column.align,
    render: (_: unknown, row: BudgetItem) => {
      if (column.key === 'category') {
        return row.category ?? row.label;
      }

      if (column.key === 'budget') {
        return formatBudgetMoney(row.budget.currency, row.budget.amountOriginal);
      }

      if (column.key === 'estimated_actuals') {
        return formatBudgetMoney(row.estimatedActuals.currency, row.estimatedActuals.amountOriginal);
      }

      if (column.key === 'variance') {
        return formatBudgetMoney(baseCurrency, row.varianceBase);
      }

      return '';
    },
    width: `${column.widthPercent}%`,
  }));
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
