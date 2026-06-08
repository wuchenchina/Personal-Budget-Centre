import { useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
  createBudgetItem,
  createTransaction,
  deleteBudgetItem,
  deleteTransaction,
  updateBudgetItem,
  updateTransaction,
} from '../api/budgetEntries';
import type { SaveBudgetItemPayload, SaveTransactionPayload } from '../api/budgetEntries';
import { convertCurrency } from '../api/exchangeRates';
import type { BudgetDetail, BudgetItem, CurrencyCode, Transaction } from '../types/budget';
import type { BudgetItemFormValues, TransactionFormValues } from '../types/forms';
import { translateCurrent } from '../i18n';
import {
  emptyInstallmentConfig,
  installmentConfigFromForm,
  installmentConfigToForm,
} from '../utils/budgetInstallments';

interface UseBudgetEntryControllerOptions {
  baseCurrency: CurrencyCode;
  selectedBudget: BudgetDetail | null;
  replaceBudgetDetail: (budget: BudgetDetail) => void;
}

export function useBudgetEntryController(options: UseBudgetEntryControllerOptions) {
  const [budgetItemForm] = Form.useForm<BudgetItemFormValues>();
  const [transactionForm] = Form.useForm<TransactionFormValues>();
  const [entryError, setEntryError] = useState<string | null>(null);
  const [isBudgetItemModalOpen, setIsBudgetItemModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isBudgetItemSaving, setIsBudgetItemSaving] = useState(false);
  const [isTransactionSaving, setIsTransactionSaving] = useState(false);
  const [editingBudgetItem, setEditingBudgetItem] = useState<BudgetItem | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingBudgetItemId, setDeletingBudgetItemId] = useState<number | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);

  const budgetBaseCurrency = options.selectedBudget?.baseCurrency ?? options.baseCurrency;
  const entryCurrency = options.selectedBudget?.displayCurrency ?? options.baseCurrency;

  const openBudgetItemCreateModal = () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setEntryError(null);
    setEditingBudgetItem(null);
    budgetItemForm.resetFields();
    budgetItemForm.setFieldsValue({
      currency: budgetBaseCurrency,
      budgetCurrency: budgetBaseCurrency,
      estimatedCurrency: budgetBaseCurrency,
      installmentConfig: emptyInstallmentConfig(),
      sortOrder: options.selectedBudget.items.length + 1,
    });
    setIsBudgetItemModalOpen(true);
  };

  const openBudgetItemEditModal = (item: BudgetItem) => {
    setEntryError(null);
    setEditingBudgetItem(item);
    budgetItemForm.resetFields();
    budgetItemForm.setFieldsValue({
      categoryId: item.categoryId ?? undefined,
      label: item.label,
      currency: item.budget.currency,
      currencyAmount: specifiedAmountFromBase(item.budget.amountBase, item.budget.rateToBase),
      budgetCurrency: item.budget.currency,
      budgetRate: item.budget.rateToBase,
      rate: item.budget.rateToBase,
      estimatedCurrency: item.estimatedActuals.currency,
      estimatedRate: item.estimatedActuals.rateToBase,
      installmentConfig: installmentConfigToForm(item.installmentConfig),
      sortOrder: item.sortOrder,
    });
    setIsBudgetItemModalOpen(true);
  };

  const closeBudgetItemModal = () => {
    setIsBudgetItemModalOpen(false);
    setEditingBudgetItem(null);
    budgetItemForm.resetFields();
  };

  const previewBudgetItemCurrencyAmount = async (values: BudgetItemFormValues): Promise<number | null> => {
    const amount = normalizedAmount(values.currencyAmount);
    if (amount === null) {
      return null;
    }

    return baseAmountFromSpecifiedCurrency(values, amount);
  };

  const handleBudgetItemSave = async () => {
    if (options.selectedBudget === null && editingBudgetItem === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await budgetItemForm.validateFields();
      setIsBudgetItemSaving(true);
      setEntryError(null);
      const amounts = await completeBudgetItemAmounts(values);
      const installmentConfig = installmentConfigFromForm(values.installmentConfig);

      const payload: SaveBudgetItemPayload = {
        categoryId: values.categoryId,
        label: values.label.trim(),
        currency: values.currency,
        currencyAmount: values.currencyAmount,
        rate: values.rate,
        bankFee: values.bankFee,
        budgetCurrency: values.currency,
        budgetAmount: amounts.budgetAmount,
        budgetRate: values.rate,
        estimatedCurrency: values.currency,
        estimatedAmount: amounts.estimatedAmount,
        estimatedRate: values.rate,
        installmentConfig,
        sortOrder: values.sortOrder ?? 0,
      };
      const savedBudget =
        editingBudgetItem === null
          ? await createBudgetItem({
              ...payload,
              budgetId: options.selectedBudget?.id ?? 0,
            })
          : await updateBudgetItem({
              ...payload,
              id: editingBudgetItem.id,
            });

      options.replaceBudgetDetail(savedBudget);
      closeBudgetItemModal();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setEntryError(error.message);
      }
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const completeBudgetItemAmounts = async (values: BudgetItemFormValues) => {
    const specifiedCurrencyAmount = normalizedAmount(values.currencyAmount);
    const currentBudgetBase = editingBudgetItem?.budget.amountBase ?? null;
    const currentEstimatedBase = editingBudgetItem?.estimatedActuals.amountBase ?? null;

    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    if (specifiedCurrencyAmount !== null) {
      return {
        budgetAmount: await baseAmountFromSpecifiedCurrency(values, specifiedCurrencyAmount),
        estimatedAmount: currentEstimatedBase ?? undefined,
      };
    }

    return {
      budgetAmount: currentBudgetBase ?? undefined,
      estimatedAmount: currentEstimatedBase ?? undefined,
    };
  };

  const baseAmountFromSpecifiedCurrency = async (
    values: BudgetItemFormValues,
    specifiedCurrencyAmount: number,
  ) => {
    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const manualRate = normalizedAmount(values.rate);
    const multiplier = 1 + (normalizedBankFee(values.bankFee) ?? 0) / 100;
    if (manualRate !== null) {
      return roundMoney(specifiedCurrencyAmount * manualRate * multiplier);
    }

    const conversion = await convertedAmount({
      workspaceId: options.selectedBudget.workspaceId,
      fromCurrency: values.currency,
      toCurrency: options.selectedBudget.baseCurrency,
      amount: specifiedCurrencyAmount,
      multiplier,
    });

    return roundMoney(conversion);
  };

  const handleBudgetItemDelete = async (id: number) => {
    setDeletingBudgetItemId(id);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await deleteBudgetItem(id));
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
    if (options.selectedBudget === null || !Number.isFinite(value)) {
      return;
    }

    const nextBudgetAmount =
      field === 'budget' ? value : item.budget.amountBase;
    const nextEstimatedAmount =
      field === 'estimated_actuals'
        ? value
        : field === 'variance'
          ? nextBudgetAmount - value
          : item.estimatedActuals.amountBase;

    if (nextBudgetAmount < 0 || nextEstimatedAmount < 0) {
      setEntryError(translateCurrent('amountMin'));

      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: item.categoryId ?? undefined,
        label: item.label,
        currency: item.budget.currency,
        budgetCurrency: item.budget.currency,
        budgetAmount: roundMoney(nextBudgetAmount),
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: item.budget.currency,
        estimatedAmount: roundMoney(nextEstimatedAmount),
        estimatedRate: item.budget.rateToBase,
        installmentConfig: item.installmentConfig,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const openTransactionCreateModal = () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setEntryError(null);
    setEditingTransaction(null);
    transactionForm.resetFields();
    const firstCategoryId = options.selectedBudget.items
      .map((item) => item.categoryId)
      .find((categoryId): categoryId is number => categoryId !== null);
    if (firstCategoryId === undefined) {
      setEntryError(translateCurrent('transactionCategoryFromHighlightsOnly'));

      return;
    }

    transactionForm.setFieldsValue({
      categoryId: firstCategoryId,
      transactionDate: dayjs(),
      currency: entryCurrency,
      sortOrder: options.selectedBudget.transactions.length + 1,
    });
    setIsTransactionModalOpen(true);
  };

  const openTransactionEditModal = (transaction: Transaction) => {
    setEntryError(null);
    setEditingTransaction(transaction);
    transactionForm.resetFields();
    transactionForm.setFieldsValue({
      categoryId: transaction.categoryId ?? undefined,
      transactionDate:
        transaction.transactionDate === null ? undefined : dayjs(transaction.transactionDate),
      details: transaction.details,
      currency: transaction.currency,
      amount: transaction.amountOriginal,
      rate: transaction.rateToBase,
      remark: transaction.remark ?? undefined,
      sortOrder: transaction.sortOrder,
    });
    setIsTransactionModalOpen(true);
  };

  const closeTransactionModal = () => {
    setIsTransactionModalOpen(false);
    setEditingTransaction(null);
    transactionForm.resetFields();
  };

  const handleTransactionSave = async () => {
    if (options.selectedBudget === null && editingTransaction === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await transactionForm.validateFields();
      setIsTransactionSaving(true);
      setEntryError(null);

      const payload: SaveTransactionPayload = {
        categoryId: values.categoryId,
        transactionDate: values.transactionDate?.format('YYYY-MM-DD') ?? null,
        details: values.details.trim(),
        currency: values.currency,
        amount: values.amount,
        remark: values.remark?.trim() || null,
        sortOrder: values.sortOrder ?? 0,
      };
      if (values.rate !== undefined) {
        payload.rate = values.rate;
      }
      const savedBudget =
        editingTransaction === null
          ? await createTransaction({
              ...payload,
              budgetId: options.selectedBudget?.id ?? 0,
            })
          : await updateTransaction({
              ...payload,
              id: editingTransaction.id,
            });

      options.replaceBudgetDetail(savedBudget);
      closeTransactionModal();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setEntryError(error.message);
      }
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionDelete = async (id: number) => {
    setDeletingTransactionId(id);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await deleteTransaction(id));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setDeletingTransactionId(null);
    }
  };

  return {
    budgetItemForm,
    transactionForm,
    entryError,
    isBudgetItemModalOpen,
    isTransactionModalOpen,
    isBudgetItemSaving,
    isTransactionSaving,
    editingBudgetItem,
    editingTransaction,
    deletingBudgetItemId,
    deletingTransactionId,
    openBudgetItemCreateModal,
    openBudgetItemEditModal,
    closeBudgetItemModal,
    handleBudgetItemSave,
    previewBudgetItemCurrencyAmount,
    handleBudgetItemDelete,
    handleBudgetItemQuickAmountSave,
    openTransactionCreateModal,
    openTransactionEditModal,
    closeTransactionModal,
    handleTransactionSave,
    handleTransactionDelete,
  };
}

function normalizedAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedBankFee(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

async function convertedAmount(input: {
  workspaceId: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amount: number;
  multiplier: number;
}): Promise<number> {
  if (input.fromCurrency === input.toCurrency) {
    return roundMoney(input.amount);
  }

  const conversion = await convertCurrency({
    workspaceId: input.workspaceId,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    amount: input.amount,
  });

  return roundMoney(conversion.convertedAmount * input.multiplier);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function specifiedAmountFromBase(amountBase: number, rateToBase: number): number | undefined {
  if (!Number.isFinite(amountBase) || !Number.isFinite(rateToBase) || rateToBase <= 0) {
    return undefined;
  }

  return roundMoney(amountBase / rateToBase);
}

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
