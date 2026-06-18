import { useState } from 'react';
import {
  updateBudgetItem,
  updateOverallInstallmentPlan,
} from '../api/budgetEntries';
import { translateCurrent } from '../i18n';
import type { BudgetDetail, BudgetItem } from '../types/budget';
import {
  createInstallmentVersions,
  distributeRemainingInstallmentAmount,
  installmentMonthsFromPeriodCount,
  installmentPeriodCountForItem,
  installmentPeriodStateFromItem,
  installmentPeriodStateFromOverallPlan,
  resetInstallmentPeriodState,
  resetInstallmentTargetAmount,
} from './budgetEntryInstallments';
import { roundMoney } from './budgetEntryMath';
import { pricingConfigForBudget } from './budgetEntryPricing';

interface InstallmentEntryActionsOptions {
  selectedBudget: BudgetDetail | null;
  replaceBudgetDetail: (budget: BudgetDetail) => void;
  setEntryError: (error: string | null) => void;
}

interface InstallmentPeriodInput {
  periodIndex: number;
  periodCount: number;
  targetAmount: number;
}

interface InstallmentAmountInput extends InstallmentPeriodInput {
  value: number;
}

export function useInstallmentEntryActions({
  selectedBudget,
  replaceBudgetDetail,
  setEntryError,
}: InstallmentEntryActionsOptions) {
  const [isInstallmentSaving, setIsInstallmentSaving] = useState(false);

  const saveBudgetItemInstallmentConfig = async (
    item: BudgetItem,
    installmentConfig: BudgetItem['installmentConfig'],
  ): Promise<BudgetDetail> => {
    if (selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    return updateBudgetItem({
      id: item.id,
      categoryId: item.categoryId ?? undefined,
      label: item.label,
      budgetCurrency: item.budget.currency,
      budgetAmount: item.budget.amountOriginal,
      budgetRate: item.budget.rateToBase,
      estimatedCurrency: selectedBudget.baseCurrency,
      estimatedAmount: 0,
      estimatedRate: 1,
      pricingConfig: pricingConfigForBudget(selectedBudget, item.pricingConfig),
      installmentConfig,
      split: item.split,
      sortOrder: item.sortOrder,
    });
  };

  const handleInstallmentHistoryClear = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    const itemsWithHistory = selectedBudget.items.filter(
      (item) => item.installmentConfig.versions.length > 0,
    );
    if (itemsWithHistory.length === 0) {
      return;
    }

    setIsInstallmentSaving(true);
    setEntryError(null);

    try {
      let savedBudget = selectedBudget;
      for (const item of itemsWithHistory) {
        savedBudget = await saveBudgetItemInstallmentConfig(item, {
          ...item.installmentConfig,
          versions: [],
        });
      }
      replaceBudgetDetail(savedBudget);
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsInstallmentSaving(false);
    }
  };

  const handleInstallmentAmountsReset = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    if (selectedBudget.installmentDisplayMode === 'overall') {
      await saveOverallInstallmentPlan({
        periodAmounts: [],
        periodLocked: [],
        periodProgress: [],
        periodRemarks: [],
      });

      return;
    }

    const installmentItems = selectedBudget.items.filter((item) => item.installmentConfig.enabled);
    if (installmentItems.length === 0) {
      return;
    }

    setIsInstallmentSaving(true);
    setEntryError(null);

    try {
      let savedBudget = selectedBudget;
      for (const item of installmentItems) {
        const resetTargetAmount = resetInstallmentTargetAmount(item, savedBudget);
        const resetPeriodCount = installmentPeriodCountForItem(item, savedBudget);
        savedBudget = await saveBudgetItemInstallmentConfig(item, {
          ...item.installmentConfig,
          periodUnit: savedBudget.installmentPeriodUnit,
          periodAmounts: [],
          periodLocked: [],
          totalAmount: resetTargetAmount,
          monthlyAmount: resetPeriodCount === null
            ? item.installmentConfig.monthlyAmount
            : roundMoney(resetTargetAmount / resetPeriodCount),
        });
      }
      replaceBudgetDetail(savedBudget);
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsInstallmentSaving(false);
    }
  };

  const handleInstallmentPeriodAmountSave = async (
    item: BudgetItem,
    periodIndex: number,
    value: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentAmountInput({ periodIndex, value, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const periodUnit = selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const editedAmount = roundMoney(value);
    const state = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...state.periodAmounts];
    const previousPeriodProgress = [...state.periodProgress];
    const previousPeriodRemarks = [...state.periodRemarks];
    state.periodAmounts[periodIndex] = editedAmount;
    state.periodLocked[periodIndex] = true;
    distributeAfterLockedPeriod(state, periodIndex, periodCount, targetAmount);
    for (let index = 0; index < periodIndex; index += 1) {
      state.periodAmounts[index] = previousPeriodAmounts[index] ?? state.periodAmounts[index];
    }
    state.periodAmounts[periodIndex] = editedAmount;

    await saveBudgetItemInstallmentState(item, {
      months,
      periodUnit,
      state,
      periodCount,
      targetAmount,
      versionLabel: 'Amount update',
      previousPeriodAmounts,
      previousPeriodProgress,
      previousPeriodRemarks,
    });
  };

  const handleOverallInstallmentPeriodAmountSave = async (
    periodIndex: number,
    value: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentAmountInput({ periodIndex, value, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const state = installmentPeriodStateFromOverallPlan(selectedBudget, periodCount, targetAmount);
    state.periodAmounts[periodIndex] = roundMoney(value);
    state.periodLocked[periodIndex] = true;
    distributeAfterLockedPeriod(state, periodIndex, periodCount, targetAmount);
    state.periodAmounts[periodIndex] = roundMoney(value);

    await saveOverallInstallmentPlan(state);
  };

  const handleOverallInstallmentProgressSave = async (
    periodIndex: number,
    checked: boolean,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const state = installmentPeriodStateFromOverallPlan(selectedBudget, periodCount, targetAmount);
    state.periodProgress[periodIndex] = checked;
    await saveOverallInstallmentPlan(state);
  };

  const handleOverallInstallmentRemarkSave = async (
    periodIndex: number,
    remark: string,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const nextRemark = remark.trim();
    const state = installmentPeriodStateFromOverallPlan(selectedBudget, periodCount, targetAmount);
    if ((state.periodRemarks[periodIndex] ?? '') === nextRemark) {
      return;
    }
    state.periodRemarks[periodIndex] = nextRemark;
    await saveOverallInstallmentPlan(state);
  };

  const handleInstallmentPeriodReset = async (
    item: BudgetItem,
    periodIndex: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const periodUnit = selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const state = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...state.periodAmounts];
    const previousPeriodProgress = [...state.periodProgress];
    const previousPeriodRemarks = [...state.periodRemarks];

    resetInstallmentPeriodState(
      state.periodAmounts,
      state.periodLocked,
      state.periodProgress,
      state.periodRemarks,
      periodIndex,
      targetAmount,
    );

    await saveBudgetItemInstallmentState(item, {
      months,
      periodUnit,
      state,
      periodCount,
      targetAmount,
      versionLabel: 'Period reset',
      previousPeriodAmounts,
      previousPeriodProgress,
      previousPeriodRemarks,
    });
  };

  const handleOverallInstallmentPeriodReset = async (
    periodIndex: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const state = installmentPeriodStateFromOverallPlan(selectedBudget, periodCount, targetAmount);
    resetInstallmentPeriodState(
      state.periodAmounts,
      state.periodLocked,
      state.periodProgress,
      state.periodRemarks,
      periodIndex,
      targetAmount,
    );
    await saveOverallInstallmentPlan(state);
  };

  const handleInstallmentProgressSave = async (
    item: BudgetItem,
    periodIndex: number,
    checked: boolean,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const periodUnit = selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const state = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...state.periodAmounts];
    const previousPeriodProgress = [...state.periodProgress];
    const previousPeriodRemarks = [...state.periodRemarks];
    state.periodProgress[periodIndex] = checked;

    await saveBudgetItemInstallmentState(item, {
      months,
      periodUnit,
      state,
      periodCount,
      targetAmount,
      versionLabel: 'Progress update',
      previousPeriodAmounts,
      previousPeriodProgress,
      previousPeriodRemarks,
    });
  };

  const handleInstallmentRemarkSave = async (
    item: BudgetItem,
    periodIndex: number,
    remark: string,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (!isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount }) || selectedBudget === null) {
      return;
    }

    const nextRemark = remark.trim();
    const periodUnit = selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const state = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    if ((state.periodRemarks[periodIndex] ?? '') === nextRemark) {
      return;
    }

    const previousPeriodAmounts = [...state.periodAmounts];
    const previousPeriodProgress = [...state.periodProgress];
    const previousPeriodRemarks = [...state.periodRemarks];
    state.periodRemarks[periodIndex] = nextRemark;

    await saveBudgetItemInstallmentState(item, {
      months,
      periodUnit,
      state,
      periodCount,
      targetAmount,
      versionLabel: 'Remark update',
      previousPeriodAmounts,
      previousPeriodProgress,
      previousPeriodRemarks,
    });
  };

  const saveBudgetItemInstallmentState = async (
    item: BudgetItem,
    {
      months,
      periodUnit,
      state,
      periodCount,
      targetAmount,
      versionLabel,
      previousPeriodAmounts,
      previousPeriodProgress,
      previousPeriodRemarks,
    }: {
      months: number;
      periodUnit: BudgetDetail['installmentPeriodUnit'];
      state: ReturnType<typeof installmentPeriodStateFromItem>;
      periodCount: number;
      targetAmount: number;
      versionLabel: string;
      previousPeriodAmounts: number[];
      previousPeriodProgress: boolean[];
      previousPeriodRemarks: string[];
    },
  ) => {
    if (selectedBudget === null) {
      return;
    }

    const totalAmount = roundMoney(targetAmount);
    const monthlyAmount = roundMoney(totalAmount / periodCount);
    setIsInstallmentSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: item.categoryId ?? undefined,
        label: item.label,
        budgetCurrency: item.budget.currency,
        budgetAmount: item.budget.amountOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        pricingConfig: pricingConfigForBudget(selectedBudget, item.pricingConfig),
        installmentConfig: {
          ...item.installmentConfig,
          enabled: true,
          months,
          periodUnit,
          paidMonths: state.periodProgress.filter(Boolean).length,
          periodAmounts: state.periodAmounts,
          periodLocked: state.periodLocked,
          periodProgress: state.periodProgress,
          periodRemarks: state.periodRemarks,
          monthlyAmount,
          totalAmount,
          versions: createInstallmentVersions(
            item,
            previousPeriodAmounts,
            previousPeriodProgress,
            previousPeriodRemarks,
            versionLabel,
          ),
        },
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsInstallmentSaving(false);
    }
  };

  const saveOverallInstallmentPlan = async (
    state: {
      periodAmounts: number[];
      periodLocked: boolean[];
      periodProgress: boolean[];
      periodRemarks: string[];
    },
  ) => {
    if (selectedBudget === null) {
      return;
    }

    setIsInstallmentSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateOverallInstallmentPlan({
        budgetId: selectedBudget.id,
        periodAmounts: state.periodAmounts,
        periodLocked: state.periodLocked,
        periodProgress: state.periodProgress,
        periodRemarks: state.periodRemarks,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsInstallmentSaving(false);
    }
  };

  return {
    isInstallmentSaving,
    handleInstallmentPeriodAmountSave,
    handleOverallInstallmentPeriodAmountSave,
    handleInstallmentPeriodReset,
    handleOverallInstallmentPeriodReset,
    handleInstallmentProgressSave,
    handleOverallInstallmentProgressSave,
    handleInstallmentRemarkSave,
    handleOverallInstallmentRemarkSave,
    handleInstallmentHistoryClear,
    handleInstallmentAmountsReset,
  };
}

function isValidInstallmentAmountInput({
  periodIndex,
  value,
  periodCount,
  targetAmount,
}: InstallmentAmountInput): boolean {
  return isValidInstallmentPeriodInput({ periodIndex, periodCount, targetAmount })
    && Number.isFinite(value)
    && value >= 0;
}

function isValidInstallmentPeriodInput({
  periodIndex,
  periodCount,
  targetAmount,
}: InstallmentPeriodInput): boolean {
  return Number.isInteger(periodIndex)
    && periodIndex >= 0
    && Number.isInteger(periodCount)
    && periodCount > 0
    && periodIndex < periodCount
    && Number.isFinite(targetAmount)
    && targetAmount > 0;
}

function distributeAfterLockedPeriod(
  state: ReturnType<typeof installmentPeriodStateFromItem>,
  periodIndex: number,
  periodCount: number,
  targetAmount: number,
) {
  const lockedIndexes = new Set<number>();
  for (let index = 0; index <= periodIndex; index += 1) {
    lockedIndexes.add(index);
  }
  state.periodLocked.forEach((isLocked, index) => {
    if (isLocked) {
      lockedIndexes.add(index);
    }
  });
  state.periodProgress.forEach((isDone, index) => {
    if (isDone) {
      lockedIndexes.add(index);
    }
  });

  const adjustableIndexes = Array.from({ length: periodCount }, (_, index) => index)
    .filter((index) => index > periodIndex && !lockedIndexes.has(index));
  const lockedTotal = Array.from(lockedIndexes)
    .reduce((total, index) => total + (state.periodAmounts[index] ?? 0), 0);
  if (adjustableIndexes.length > 0) {
    distributeRemainingInstallmentAmount(state.periodAmounts, adjustableIndexes, targetAmount, lockedTotal);
  }
}
