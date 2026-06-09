import dayjs from 'dayjs';
import type { BudgetInstallmentConfig } from '../types/budget';
import type { BudgetInstallmentFormConfig } from '../types/forms';

export function emptyInstallmentConfig(): BudgetInstallmentConfig {
  return {
    enabled: false,
    months: null,
    paidMonths: 0,
    monthlyAmount: null,
    totalAmount: null,
    periodAmounts: [],
    startMonth: null,
    periodUnit: 'month',
    remark: null,
  };
}

export function installmentConfigToForm(
  config: BudgetInstallmentConfig | null | undefined,
): BudgetInstallmentFormConfig {
  const normalized = normalizeInstallmentConfig(config);

  return {
    ...normalized,
    startMonth:
      normalized.startMonth === null ? null : dayjs(`${normalized.startMonth}-01`),
  };
}

export function installmentConfigFromForm(
  config: BudgetInstallmentFormConfig | null | undefined,
): BudgetInstallmentConfig {
  if (config === null || config === undefined) {
    return emptyInstallmentConfig();
  }

  return normalizeInstallmentConfig({
    ...config,
    startMonth: config.startMonth?.format('YYYY-MM') ?? null,
  });
}

export function normalizeInstallmentConfig(
  config: Partial<BudgetInstallmentConfig> | null | undefined,
): BudgetInstallmentConfig {
  if (config === null || config === undefined) {
    return emptyInstallmentConfig();
  }

  const enabled = config.enabled === true;
  const months = normalizePositiveInt(config.months);
  const paidMonths = Math.min(months ?? 0, normalizeNonNegativeInt(config.paidMonths) ?? 0);
  const monthlyAmount = normalizeNonNegativeNumber(config.monthlyAmount);
  const totalAmount = normalizeNonNegativeNumber(config.totalAmount);
  const periodAmounts = normalizePeriodAmounts(config.periodAmounts);
  const startMonth = normalizeMonth(config.startMonth);
  const periodUnit = normalizePeriodUnit(config.periodUnit);
  const remark = normalizeText(config.remark);

  if (!enabled) {
    return emptyInstallmentConfig();
  }

  return {
    enabled,
    months,
    paidMonths,
    monthlyAmount,
    totalAmount,
    periodAmounts,
    startMonth,
    periodUnit,
    remark,
  };
}

export function installmentSummary(
  config: BudgetInstallmentConfig | null | undefined,
): {
  isEnabled: boolean;
  remainingMonths: number | null;
  monthlyAmount: number | null;
  totalAmount: number | null;
  endMonth: string | null;
} {
  const normalized = normalizeInstallmentConfig(config);
  if (!normalized.enabled) {
    return {
      isEnabled: false,
      remainingMonths: null,
      monthlyAmount: null,
      totalAmount: null,
      endMonth: null,
    };
  }

  const remainingMonths =
    normalized.months === null ? null : Math.max(0, normalized.months - normalized.paidMonths);
  const monthlyAmount =
    normalized.monthlyAmount
    ?? (normalized.totalAmount !== null && normalized.months !== null
      ? normalized.totalAmount / normalized.months
      : null);
  const totalAmount = normalized.periodAmounts.length > 0
    ? normalized.periodAmounts.reduce((total, amount) => total + amount, 0)
    : normalized.totalAmount
      ?? (monthlyAmount !== null && normalized.months !== null
        ? monthlyAmount * normalized.months
        : null);
  const endMonth =
    normalized.startMonth !== null && normalized.months !== null
      ? dayjs(`${normalized.startMonth}-01`).add(normalized.months - 1, 'month').format('YYYY-MM')
      : null;

  return {
    isEnabled: true,
    remainingMonths,
    monthlyAmount,
    totalAmount,
    endMonth,
  };
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function normalizeNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizePeriodAmounts(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((amount) => normalizeNonNegativeNumber(amount))
    .filter((amount): amount is number => amount !== null);
}

function normalizeMonth(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  return dayjs(`${value}-01`).isValid() ? value : null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function normalizePeriodUnit(value: unknown): BudgetInstallmentConfig['periodUnit'] {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
    ? value
    : 'month';
}
