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
import { convertCurrency, refreshBochkRates } from '../api/exchangeRates';
import type { BudgetDetail, BudgetItem, CurrencyCode, Transaction } from '../types/budget';
import type { BudgetItemFormValues, TransactionFormValues } from '../types/forms';
import { translateCurrent } from '../i18n';
import {
  emptyInstallmentConfig,
  installmentConfigFromForm,
  installmentConfigToForm,
} from '../utils/budgetInstallments';
import { effectiveBudgetItemAmounts } from '../utils/budgetTemplate';

export type BudgetItemModalFocus = 'category' | 'budget' | 'estimated_actuals' | 'variance' | null;

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
  const [budgetItemModalFocus, setBudgetItemModalFocus] = useState<BudgetItemModalFocus>(null);
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
      budgetCurrency: budgetBaseCurrency,
      budgetAmount: undefined,
      budgetRate: undefined,
      installmentConfig: emptyInstallmentConfig(),
      sortOrder: options.selectedBudget.items.length + 1,
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
      budgetAmount: item.budget.amountOriginal,
      budgetRate: item.budget.rateToBase,
      installmentConfig: installmentConfigToForm(item.installmentConfig),
      sortOrder: item.sortOrder,
    });
    setBudgetItemModalFocus(focus);
    setIsBudgetItemModalOpen(true);
  };

  const closeBudgetItemModal = () => {
    setIsBudgetItemModalOpen(false);
    setEditingBudgetItem(null);
    setBudgetItemModalFocus(null);
    budgetItemForm.resetFields();
  };

  const handleBudgetItemSave = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await budgetItemForm.validateFields();
      setIsBudgetItemSaving(true);
      setEntryError(null);
      const installmentConfig = installmentConfigFromForm(values.installmentConfig);
      const valuesWithInstallmentBudget = {
        ...values,
        budgetAmount: installmentConfig.enabled && installmentConfig.monthlyAmount !== null
          ? installmentConfig.monthlyAmount
          : values.budgetAmount,
      };
      const amounts = await completeBudgetItemAmounts(valuesWithInstallmentBudget);

      const payload: SaveBudgetItemPayload = {
        categoryId: valuesWithInstallmentBudget.categoryId,
        label: valuesWithInstallmentBudget.label.trim(),
        bankFee: valuesWithInstallmentBudget.bankFee,
        budgetCurrency: valuesWithInstallmentBudget.budgetCurrency,
        budgetAmount: amounts.budgetAmount ?? undefined,
        budgetRate: amounts.budgetRate ?? valuesWithInstallmentBudget.budgetRate,
        estimatedCurrency: options.selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        installmentConfig,
        sortOrder: valuesWithInstallmentBudget.sortOrder ?? 0,
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
    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const budgetAmount = normalizedAmount(values.budgetAmount);
    const budgetRate = normalizedAmount(values.budgetRate);

    if (budgetAmount === null) {
      return {
        budgetAmount: undefined,
        budgetRate: budgetRate ?? undefined,
      };
    }

    const resolvedBudgetRate = budgetRate
      ?? await resolveRate(values.budgetCurrency, options.selectedBudget.baseCurrency);

    return {
      budgetAmount,
      budgetRate: resolvedBudgetRate,
    };
  };

  const handleBudgetItemRateRefresh = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      await refreshBochkRates(options.selectedBudget.workspaceId);
      const values = budgetItemForm.getFieldsValue();
      const budgetRate = await resolveRate(values.budgetCurrency, options.selectedBudget.baseCurrency);

      budgetItemForm.setFieldsValue({
        budgetRate,
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleTransactionRateRefresh = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      await refreshBochkRates(options.selectedBudget.workspaceId);
      const values = transactionForm.getFieldsValue();
      const rate = await resolveRate(values.currency, options.selectedBudget.baseCurrency);
      const referenceAmount = values.referenceCurrency === undefined
        ? undefined
        : await convertedTransactionReferenceAmount(values, rate);

      transactionForm.setFieldsValue({
        rate,
        ...(referenceAmount === undefined ? {} : { referenceAmount }),
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionReferenceConvert = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    const values = transactionForm.getFieldsValue();
    if (values.referenceCurrency === undefined) {
      setEntryError(translateCurrent('selectReferenceCurrency'));

      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      const rate = normalizedAmount(values.rate)
        ?? await resolveRate(values.currency, options.selectedBudget.baseCurrency);
      const referenceAmount = await convertedTransactionReferenceAmount(values, rate);

      transactionForm.setFieldsValue({
        rate,
        referenceAmount,
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

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

  const convertedTransactionReferenceAmount = async (
    values: TransactionFormValues,
    rateToBase: number,
  ): Promise<number> => {
    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const amount = normalizedAmount(values.amount);
    if (amount === null) {
      throw new Error(translateCurrent('amountRequired'));
    }

    if (values.referenceCurrency === undefined) {
      throw new Error(translateCurrent('selectReferenceCurrency'));
    }

    const baseAmount = roundMoney(amount * rateToBase);
    if (values.referenceCurrency === options.selectedBudget.baseCurrency) {
      return baseAmount;
    }

    const conversion = await convertCurrency({
      workspaceId: options.selectedBudget.workspaceId,
      fromCurrency: options.selectedBudget.baseCurrency,
      toCurrency: values.referenceCurrency,
      amount: baseAmount,
      rateDate: values.transactionDate?.format('YYYY-MM-DD'),
    });

    return roundMoney(conversion.convertedAmount);
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

    const effective = effectiveBudgetItemAmounts(item, options.selectedBudget.transactions);
    const finalBudgetOriginal = field === 'budget'
      ? value
      : field === 'variance'
      ? originalAmountFromBase(effective.estimatedAmountBase + value, item.budget.rateToBase)
      : item.budget.amountOriginal;
    const finalBudgetBase = roundMoney(finalBudgetOriginal * item.budget.rateToBase);

    if (field === 'estimated_actuals') {
      setEntryError(translateCurrent('estimatedActualsFromTransactionsOnly'));

      return;
    }

    if (finalBudgetOriginal < 0 || finalBudgetBase < 0) {
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
        budgetCurrency: item.budget.currency,
        budgetAmount: finalBudgetOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: options.selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
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
      referenceCurrency: undefined,
      referenceAmount: undefined,
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
      referenceCurrency: transaction.referenceCurrency ?? undefined,
      referenceAmount: transaction.referenceAmountOriginal ?? undefined,
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
      const referenceAmount = normalizedAmount(values.referenceAmount);

      const payload: SaveTransactionPayload = {
        categoryId: values.categoryId,
        transactionDate: values.transactionDate?.format('YYYY-MM-DD') ?? null,
        details: values.details.trim(),
        currency: values.currency,
        amount: values.amount,
        referenceCurrency: referenceAmount === null ? undefined : values.referenceCurrency,
        referenceAmount,
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

  const handleBudgetItemCategoryQuickSave = async (
    item: BudgetItem,
    categoryId: number | null,
    label: string,
  ) => {
    if (options.selectedBudget === null || label.trim() === '') {
      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: categoryId ?? undefined,
        label: label.trim(),
        budgetCurrency: item.budget.currency,
        budgetAmount: item.budget.amountOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: options.selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        installmentConfig: item.installmentConfig,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleInstallmentPeriodAmountSave = async (
    item: BudgetItem,
    periodIndex: number,
    value: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isFinite(value)
      || value < 0
      || item.installmentConfig.months === null
    ) {
      return;
    }

    const months = item.installmentConfig.months;
    const periodCount = installmentPeriodCountFromMonths(months, options.selectedBudget.installmentPeriodUnit);
    const defaultAmount = item.installmentConfig.monthlyAmount
      ?? (item.installmentConfig.totalAmount === null ? null : item.installmentConfig.totalAmount / months)
      ?? item.budget.amountOriginal;
    const periodAmounts = Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodAmounts[index] ?? defaultAmount,
    );
    periodAmounts[periodIndex] = roundMoney(value);
    const totalAmount = roundMoney(periodAmounts.reduce((total, amount) => total + amount, 0));
    const monthlyAmount = roundMoney(totalAmount / periodCount);

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateBudgetItem({
        id: item.id,
        categoryId: item.categoryId ?? undefined,
        label: item.label,
        budgetCurrency: item.budget.currency,
        budgetAmount: item.budget.amountOriginal,
        budgetRate: item.budget.rateToBase,
        estimatedCurrency: options.selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        installmentConfig: {
          ...item.installmentConfig,
          periodAmounts,
          monthlyAmount,
          totalAmount,
        },
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleTransactionQuickAmountSave = async (
    transaction: Transaction,
    value: number,
  ) => {
    if (options.selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: value,
        rate: transaction.rateToBase,
        referenceCurrency: transaction.referenceCurrency ?? undefined,
        referenceAmount: transaction.referenceAmountOriginal,
        remark: transaction.remark,
        sortOrder: transaction.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionQuickCurrencySave = async (
    transaction: Transaction,
    currency: CurrencyCode,
  ) => {
    if (options.selectedBudget === null || transaction.currency === currency) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency,
        amount: transaction.amountOriginal,
        referenceCurrency: transaction.referenceCurrency ?? undefined,
        referenceAmount: transaction.referenceAmountOriginal,
        remark: transaction.remark,
        sortOrder: transaction.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionCategoryQuickSave = async (
    transaction: Transaction,
    categoryId: number,
  ) => {
    if (options.selectedBudget === null || !Number.isInteger(categoryId)) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: transaction.amountOriginal,
        rate: transaction.rateToBase,
        referenceCurrency: transaction.referenceCurrency ?? undefined,
        referenceAmount: transaction.referenceAmountOriginal,
        remark: transaction.remark,
        sortOrder: transaction.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionQuickRemarkSave = async (
    transaction: Transaction,
    remark: string,
  ) => {
    if (options.selectedBudget === null) {
      return;
    }

    const nextRemark = remark.trim();
    const normalizedRemark = nextRemark === '' ? null : nextRemark;
    if ((transaction.remark ?? null) === normalizedRemark) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: transaction.amountOriginal,
        rate: transaction.rateToBase,
        referenceCurrency: transaction.referenceCurrency ?? undefined,
        referenceAmount: transaction.referenceAmountOriginal,
        remark: normalizedRemark,
        sortOrder: transaction.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
    budgetItemModalFocus,
    closeBudgetItemModal,
    handleBudgetItemSave,
    handleBudgetItemDelete,
    handleBudgetItemQuickAmountSave,
    handleBudgetItemCategoryQuickSave,
    handleInstallmentPeriodAmountSave,
    handleBudgetItemRateRefresh,
    openTransactionCreateModal,
    openTransactionEditModal,
    closeTransactionModal,
    handleTransactionSave,
    handleTransactionRateRefresh,
    handleTransactionReferenceConvert,
    handleTransactionQuickAmountSave,
    handleTransactionQuickCurrencySave,
    handleTransactionCategoryQuickSave,
    handleTransactionQuickRemarkSave,
    handleTransactionDelete,
  };
}

function normalizedAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function installmentPeriodCountFromMonths(
  months: number,
  unit: BudgetDetail['installmentPeriodUnit'],
): number {
  if (unit === 'day') {
    return Math.max(1, Math.ceil(months * (365 / 12)));
  }

  if (unit === 'week') {
    return Math.max(1, Math.ceil(months * (52 / 12)));
  }

  if (unit === 'year') {
    return Math.max(1, Math.ceil(months / 12));
  }

  return months;
}

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
