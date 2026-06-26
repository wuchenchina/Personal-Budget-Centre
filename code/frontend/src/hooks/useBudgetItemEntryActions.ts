import { useState } from 'react';
import { Form } from 'antd';
import {
  createBudgetItem,
  deleteBudgetItem,
  updateBudgetItem,
  type SaveBudgetItemPayload,
} from '../api/budgetEntries';
import { refreshBochkRates, syncBudgetExchangeRatesFromGlobal } from '../api/exchangeRates';
import { translateCurrent } from '../i18n';
import type { BudgetDetail, BudgetItem, CurrencyCode } from '../types/budget';
import type { BudgetItemFormValues } from '../types/forms';
import {
  emptyInstallmentConfig,
  installmentConfigFromForm,
  installmentConfigToForm,
} from '../utils/budgetInstallments';
import { budgetItemAmountMultiplier, effectiveBudgetItemAmounts } from '../utils/budgetTemplate';
import { syncCurrencyTriadAfterProgrammaticChange } from '../utils/currencyTriad';
import { normalizedAmount, originalAmountFromBase, roundMoney } from './budgetEntryMath';
import {
  emptyPricingConfig,
  pricingConfigForBudget,
  pricingConfigFromForm,
  pricingTotalFromForm,
} from './budgetEntryPricing';
import {
  defaultSplitFormValue,
  splitPayloadFromForm,
  splitToFormValue,
} from './budgetEntrySplit';
import type { BudgetItemModalFocus } from './budgetEntryTypes';

interface BudgetItemEntryActionsOptions {
  baseCurrency: CurrencyCode;
  selectedBudget: BudgetDetail | null;
  replaceBudgetDetail: (budget: BudgetDetail) => void;
  resolveRate: (fromCurrency: CurrencyCode, toCurrency: CurrencyCode) => Promise<number>;
  setEntryError: (error: string | null) => void;
}

export function useBudgetItemEntryActions({
  baseCurrency,
  selectedBudget,
  replaceBudgetDetail,
  resolveRate,
  setEntryError,
}: BudgetItemEntryActionsOptions) {
  const [budgetItemForm] = Form.useForm<BudgetItemFormValues>();
  const [isBudgetItemModalOpen, setIsBudgetItemModalOpen] = useState(false);
  const [isBudgetItemSaving, setIsBudgetItemSaving] = useState(false);
  const [editingBudgetItem, setEditingBudgetItem] = useState<BudgetItem | null>(null);
  const [budgetItemModalFocus, setBudgetItemModalFocus] = useState<BudgetItemModalFocus>(null);
  const [deletingBudgetItemId, setDeletingBudgetItemId] = useState<number | null>(null);
  const budgetBaseCurrency = selectedBudget?.baseCurrency ?? baseCurrency;

  const closeBudgetItemModal = () => {
    setIsBudgetItemModalOpen(false);
    setEditingBudgetItem(null);
    setBudgetItemModalFocus(null);
  };

  const openBudgetItemCreateModal = () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setEntryError(null);
    setEditingBudgetItem(null);
    budgetItemForm.resetFields();
    budgetItemForm.setFieldsValue({
      budgetCurrency: budgetBaseCurrency,
      budgetAmount: undefined,
      budgetRate: undefined,
      rateScope: 'item',
      pricingConfig: emptyPricingConfig(),
      installmentConfig: emptyInstallmentConfig(),
      split: defaultSplitFormValue(selectedBudget),
      sortOrder: selectedBudget.items.length + 1,
    });
    setBudgetItemModalFocus(null);
    setIsBudgetItemModalOpen(true);
  };

  const openBudgetItemEditModal = (item: BudgetItem, focus: BudgetItemModalFocus = null) => {
    setEntryError(null);
    setEditingBudgetItem(item);
    budgetItemForm.resetFields();
    budgetItemForm.setFieldsValue({
      categoryId: item.categoryId ?? undefined,
      label: item.label,
      budgetCurrency: item.budget.currency,
      budgetAmount: itemBudgetAmountFormValue(item),
      budgetRate: item.budget.rateToBase,
      budgetTargetBaseAmount: item.budget.amountBase,
      rateScope: 'item',
      pricingConfig: selectedBudget?.pricingEnabled === true
        ? item.pricingConfig
        : emptyPricingConfig(),
      installmentConfig: installmentConfigToForm(item.installmentConfig),
      split: splitToFormValue(item, selectedBudget),
      sortOrder: item.sortOrder,
    });
    setBudgetItemModalFocus(focus);
    setIsBudgetItemModalOpen(true);
  };

  const completeBudgetItemAmounts = async (values: BudgetItemFormValues) => {
    if (selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const pricingTotal = pricingTotalFromForm(values.pricingConfig, selectedBudget.pricingEnabled);
    const budgetAmount = pricingTotal ?? normalizedAmount(values.budgetAmount);
    const budgetRate = normalizedAmount(values.budgetRate);

    if (budgetAmount === null) {
      return {
        budgetAmount: undefined,
        budgetRate: budgetRate ?? undefined,
      };
    }

    const resolvedBudgetRate = budgetRate
      ?? await resolveRate(values.budgetCurrency, selectedBudget.baseCurrency);

    return {
      budgetAmount,
      budgetRate: resolvedBudgetRate,
    };
  };

  const handleBudgetItemSave = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await budgetItemForm.validateFields();
      setIsBudgetItemSaving(true);
      setEntryError(null);
      const installmentConfig = installmentConfigFromForm(values.installmentConfig);
      const amounts = await completeBudgetItemAmounts(values);
      const pricingConfig = pricingConfigFromForm(values.pricingConfig, selectedBudget.pricingEnabled);

      const payload: SaveBudgetItemPayload = {
        categoryId: values.categoryId,
        label: values.label.trim(),
        bankFee: values.bankFee,
        budgetCurrency: values.budgetCurrency,
        budgetAmount: amounts.budgetAmount ?? undefined,
        budgetRate: amounts.budgetRate ?? values.budgetRate,
        rateScope: values.rateScope ?? 'item',
        estimatedCurrency: selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        pricingConfig,
        installmentConfig,
        split: splitPayloadFromForm(values, selectedBudget),
        sortOrder: values.sortOrder ?? 0,
      };
      const savedBudget =
        editingBudgetItem === null
          ? await createBudgetItem({
              ...payload,
              budgetId: selectedBudget.id,
            })
          : await updateBudgetItem({
              ...payload,
              id: editingBudgetItem.id,
            });

      replaceBudgetDetail(savedBudget);
      closeBudgetItemModal();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setEntryError(error.message);
      }
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleBudgetItemRateRefresh = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      await refreshBochkRates(selectedBudget.workspaceId);
      const values = budgetItemForm.getFieldsValue();
      const budgetRate = await resolveRate(values.budgetCurrency, selectedBudget.baseCurrency);
      const nextValues = {
        ...values,
        budgetRate,
      };

      budgetItemForm.setFieldsValue({
        budgetRate,
        ...syncCurrencyTriadAfterProgrammaticChange(nextValues, budgetItemBaseTriadKeys),
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleBudgetItemGlobalRateSync = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }
    const values = budgetItemForm.getFieldsValue();
    if (!values.budgetCurrency || values.budgetCurrency === selectedBudget.baseCurrency) {
      return;
    }
    setIsBudgetItemSaving(true);
    setEntryError(null);
    try {
      const result = await syncBudgetExchangeRatesFromGlobal({
        budgetId: selectedBudget.id,
        pairs: [{
          fromCurrency: values.budgetCurrency,
          toCurrency: selectedBudget.baseCurrency,
        }],
      });
      const synced = result.applied[0];
      if (synced === undefined) {
        throw new Error(translateCurrent('loadingExchangeRatesFailed'));
      }
      const nextValues = {
        ...values,
        budgetRate: synced.rate,
      };
      budgetItemForm.setFieldsValue({
        budgetRate: synced.rate,
        rateScope: 'budget_default',
        ...syncCurrencyTriadAfterProgrammaticChange(nextValues, budgetItemBaseTriadKeys),
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleBudgetItemDelete = async (id: number) => {
    setDeletingBudgetItemId(id);
    setEntryError(null);

    try {
      replaceBudgetDetail(await deleteBudgetItem(id));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setDeletingBudgetItemId(null);
    }
  };

  const handleBudgetItemQuickAmountSave = async (
    item: BudgetItem,
    field: string,
    value: number,
  ) => {
    if (selectedBudget === null || !Number.isFinite(value)) {
      return;
    }

    if (selectedBudget.pricingEnabled && item.pricingConfig.enabled && field !== 'estimated_actuals') {
      setEntryError(translateCurrent('unitPricingQuickEditBlocked'));

      return;
    }

    const effective = effectiveBudgetItemAmounts(item, selectedBudget.transactions);
    const amountMultiplier = budgetItemAmountMultiplier(item);
    const finalBudgetOriginal = field === 'budget'
      ? roundMoney(value / amountMultiplier)
      : field === 'variance'
      ? roundMoney(originalAmountFromBase(effective.estimatedAmountBase + value, item.budget.rateToBase) / amountMultiplier)
      : item.budget.amountOriginal;

    if (field === 'estimated_actuals') {
      setEntryError(translateCurrent('estimatedActualsFromTransactionsOnly'));

      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: item.categoryId ?? undefined,
        label: item.label,
        budgetCurrency: item.budget.currency,
        budgetAmount: finalBudgetOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        pricingConfig: pricingConfigForBudget(selectedBudget, item.pricingConfig),
        installmentConfig: item.installmentConfig,
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleBudgetItemCategoryQuickSave = async (
    item: BudgetItem,
    categoryId: number | null,
    label: string,
  ) => {
    if (selectedBudget === null || label.trim() === '') {
      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: categoryId ?? undefined,
        label: label.trim(),
        budgetCurrency: item.budget.currency,
        budgetAmount: item.budget.amountOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        pricingConfig: pricingConfigForBudget(selectedBudget, item.pricingConfig),
        installmentConfig: item.installmentConfig,
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  return {
    budgetItemForm,
    isBudgetItemModalOpen,
    isBudgetItemSaving,
    editingBudgetItem,
    deletingBudgetItemId,
    budgetItemModalFocus,
    openBudgetItemCreateModal,
    openBudgetItemEditModal,
    closeBudgetItemModal,
    handleBudgetItemSave,
    handleBudgetItemDelete,
    handleBudgetItemQuickAmountSave,
    handleBudgetItemCategoryQuickSave,
    handleBudgetItemRateRefresh,
    handleBudgetItemGlobalRateSync,
  };
}

const budgetItemBaseTriadKeys = {
  amountKey: 'budgetAmount',
  rateKey: 'budgetRate',
  targetKey: 'budgetTargetBaseAmount',
} as const;

function itemBudgetAmountFormValue(item: BudgetItem): number | undefined {
  return item.budget.amountOriginal === 0 && item.budget.amountBase === 0
    ? undefined
    : item.budget.amountOriginal;
}
