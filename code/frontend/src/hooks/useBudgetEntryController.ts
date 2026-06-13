import { useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
  createBudgetItem,
  createTransaction,
  deleteBudgetItem,
  deleteTransaction,
  updateOverallInstallmentPlan,
  updateBudgetItem,
  updateTransaction,
} from '../api/budgetEntries';
import type { SaveBudgetItemPayload, SaveTransactionPayload } from '../api/budgetEntries';
import { convertCurrency, refreshBochkRates } from '../api/exchangeRates';
import type {
  BudgetDetail,
  BudgetItem,
  BudgetItemSplit,
  CurrencyCode,
  Transaction,
} from '../types/budget';
import type { BudgetItemFormValues, TransactionFormValues } from '../types/forms';
import { translateCurrent } from '../i18n';
import {
  emptyInstallmentConfig,
  installmentConfigFromForm,
  installmentConfigToForm,
} from '../utils/budgetInstallments';
import { budgetItemAmountMultiplier, effectiveBudgetItemAmounts } from '../utils/budgetTemplate';

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
      pricingConfig: emptyPricingConfig(),
      installmentConfig: emptyInstallmentConfig(),
      split: defaultSplitFormValue(options.selectedBudget),
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
      budgetAmount: itemBudgetAmountFormValue(item),
      budgetRate: item.budget.rateToBase,
      pricingConfig: options.selectedBudget?.pricingEnabled === true
        ? item.pricingConfig
        : emptyPricingConfig(),
      installmentConfig: installmentConfigToForm(item.installmentConfig),
      split: splitToFormValue(item, options.selectedBudget),
      sortOrder: item.sortOrder,
    });
    setBudgetItemModalFocus(focus);
    setIsBudgetItemModalOpen(true);
  };

  const closeBudgetItemModal = () => {
    setIsBudgetItemModalOpen(false);
    setEditingBudgetItem(null);
    setBudgetItemModalFocus(null);
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
      const amounts = await completeBudgetItemAmounts(values);
      const pricingConfig = pricingConfigFromForm(values.pricingConfig, options.selectedBudget.pricingEnabled);

      const payload: SaveBudgetItemPayload = {
        categoryId: values.categoryId,
        label: values.label.trim(),
        bankFee: values.bankFee,
        budgetCurrency: values.budgetCurrency,
        budgetAmount: amounts.budgetAmount ?? undefined,
        budgetRate: amounts.budgetRate ?? values.budgetRate,
        estimatedCurrency: options.selectedBudget.baseCurrency,
        estimatedAmount: 0,
        estimatedRate: 1,
        pricingConfig,
        installmentConfig,
        split: splitPayloadFromForm(values, options.selectedBudget),
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
    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const pricingTotal = pricingTotalFromForm(values.pricingConfig, options.selectedBudget.pricingEnabled);
    const budgetAmount = pricingTotal ?? normalizedAmount(values.budgetAmount);
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

      transactionForm.setFieldsValue({
        rate,
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

    const pricingTotal = transactionPricingTotalFromForm(values.pricingConfig, options.selectedBudget.pricingEnabled);
    const amount = pricingTotal ?? normalizedAmount(values.amount);
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

    if (options.selectedBudget.pricingEnabled && item.pricingConfig.enabled && field !== 'estimated_actuals') {
      setEntryError(translateCurrent('unitPricingQuickEditBlocked'));

      return;
    }

    const effective = effectiveBudgetItemAmounts(item, options.selectedBudget.transactions);
    const amountMultiplier = budgetItemAmountMultiplier(item);
    const finalBudgetOriginal = field === 'budget'
      ? roundMoney(value / amountMultiplier)
      : field === 'variance'
      ? roundMoney(originalAmountFromBase(effective.estimatedAmountBase + value, item.budget.rateToBase) / amountMultiplier)
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
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
      paymentMode: 'single',
      paidByParticipantId: defaultTransactionPaidByParticipantId(
        options.selectedBudget,
        firstCategoryId,
      ) ?? undefined,
      payments: defaultTransactionPaymentRows(options.selectedBudget, firstCategoryId),
      transactionDate: dayjs(),
      currency: entryCurrency,
      referenceCurrency: undefined,
      referenceAmount: undefined,
      pricingConfig: transactionPricingConfigForCreateForm(options.selectedBudget),
      sortOrder: options.selectedBudget.transactions.length + 1,
    });
    setIsTransactionModalOpen(true);
  };

  const openTransactionEditModal = (transaction: Transaction) => {
    setEntryError(null);
    setEditingTransaction(transaction);
    transactionForm.resetFields();
    const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
      options.selectedBudget,
      transaction.categoryId ?? undefined,
    );
    transactionForm.setFieldsValue({
      categoryId: transaction.categoryId ?? undefined,
      paymentMode:
        supportsTransactionPayments && transaction.payments.length > 0 ? 'multiple' : 'single',
      paidByParticipantId: supportsTransactionPayments
        ? transaction.paidByParticipantId
          ?? defaultTransactionPaidByParticipantId(
            options.selectedBudget,
            transaction.categoryId ?? undefined,
          )
          ?? undefined
        : null,
      payments: transactionPaymentRowsToForm(transaction, options.selectedBudget),
      transactionDate:
        transaction.transactionDate === null ? undefined : dayjs(transaction.transactionDate),
      details: transaction.details,
      currency: transaction.currency,
      amount: transaction.amountOriginal,
      rate: transaction.rateToBase,
      pricingConfig: transactionPricingConfigForEditForm(transaction, options.selectedBudget),
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
    setEntryError(null);
  };

  const handleTransactionCategoryChange = (categoryId: number | null | undefined) => {
    if (options.selectedBudget === null) {
      return;
    }

    const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
      options.selectedBudget,
      categoryId,
    );

    transactionForm.setFieldsValue({
      paymentMode: supportsTransactionPayments
        ? transactionForm.getFieldValue('paymentMode') ?? 'single'
        : 'single',
      paidByParticipantId: defaultTransactionPaidByParticipantId(options.selectedBudget, categoryId),
      payments: defaultTransactionPaymentRows(options.selectedBudget, categoryId),
    });
  };

  const clearEntryError = () => {
    setEntryError(null);
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
      const pricingConfig = transactionPricingConfigFromForm(
        values.pricingConfig,
        options.selectedBudget?.pricingEnabled === true,
      );
      const pricingTotal = pricingConfig.enabled ? pricingConfig.totalAmount : null;
      const transactionAmount = pricingTotal ?? normalizedAmount(values.amount);
      if (transactionAmount === null) {
        throw new Error(translateCurrent('amountRequired'));
      }
      const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
        options.selectedBudget,
        values.categoryId,
      );

      const payload: SaveTransactionPayload = {
        categoryId: values.categoryId,
        paidByParticipantId: transactionPaidByParticipantIdFromForm(values, options.selectedBudget),
        paymentMode: supportsTransactionPayments ? values.paymentMode ?? 'single' : 'single',
        payments: transactionPaymentsFromForm(values, options.selectedBudget, transactionAmount),
        transactionDate: values.transactionDate?.format('YYYY-MM-DD') ?? null,
        details: values.details.trim(),
        currency: values.currency,
        amount: transactionAmount,
        referenceCurrency: referenceAmount === null ? undefined : values.referenceCurrency,
        referenceAmount,
        pricingConfig,
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
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

  const saveBudgetItemInstallmentConfig = async (
    item: BudgetItem,
    installmentConfig: BudgetItem['installmentConfig'],
  ): Promise<BudgetDetail> => {
    if (options.selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    return updateBudgetItem({
      id: item.id,
      categoryId: item.categoryId ?? undefined,
      label: item.label,
      budgetCurrency: item.budget.currency,
      budgetAmount: item.budget.amountOriginal,
      budgetRate: item.budget.rateToBase,
      estimatedCurrency: options.selectedBudget.baseCurrency,
      estimatedAmount: 0,
      estimatedRate: 1,
      pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
      installmentConfig,
      split: item.split,
      sortOrder: item.sortOrder,
    });
  };

  const handleInstallmentHistoryClear = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    const itemsWithHistory = options.selectedBudget.items.filter(
      (item) => item.installmentConfig.versions.length > 0,
    );
    if (itemsWithHistory.length === 0) {
      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      let savedBudget = options.selectedBudget;
      for (const item of itemsWithHistory) {
        savedBudget = await saveBudgetItemInstallmentConfig(item, {
          ...item.installmentConfig,
          versions: [],
        });
      }
      options.replaceBudgetDetail(savedBudget);
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleInstallmentAmountsReset = async () => {
    if (options.selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    if (options.selectedBudget.installmentDisplayMode === 'overall') {
      setIsBudgetItemSaving(true);
      setEntryError(null);

      try {
        options.replaceBudgetDetail(await updateOverallInstallmentPlan({
          budgetId: options.selectedBudget.id,
          periodAmounts: [],
          periodLocked: [],
          periodProgress: [],
          periodRemarks: [],
        }));
      } catch (error: unknown) {
        setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
      } finally {
        setIsBudgetItemSaving(false);
      }

      return;
    }

    const installmentItems = options.selectedBudget.items.filter(
      (item) => item.installmentConfig.enabled,
    );
    if (installmentItems.length === 0) {
      return;
    }

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      let savedBudget = options.selectedBudget;
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
      options.replaceBudgetDetail(savedBudget);
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
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isFinite(value)
      || value < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const periodUnit = options.selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const editedAmount = roundMoney(value);
    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...periodAmounts];
    const previousPeriodProgress = [...periodProgress];
    const previousPeriodRemarks = [...periodRemarks];
    periodAmounts[periodIndex] = editedAmount;
    periodLocked[periodIndex] = true;
    const lockedIndexes = new Set<number>();
    for (let index = 0; index <= periodIndex; index += 1) {
      lockedIndexes.add(index);
    }
    periodLocked.forEach((isLocked, index) => {
      if (isLocked) {
        lockedIndexes.add(index);
      }
    });
    periodProgress.forEach((isDone, index) => {
      if (isDone) {
        lockedIndexes.add(index);
      }
    });
    const adjustableIndexes = Array.from({ length: periodCount }, (_, index) => index)
      .filter((index) => index > periodIndex && !lockedIndexes.has(index));
    const lockedTotal = Array.from(lockedIndexes)
      .reduce((total, index) => total + (periodAmounts[index] ?? 0), 0);
    if (adjustableIndexes.length > 0) {
      distributeRemainingInstallmentAmount(periodAmounts, adjustableIndexes, targetAmount, lockedTotal);
    }
    for (let index = 0; index < periodIndex; index += 1) {
      periodAmounts[index] = previousPeriodAmounts[index] ?? periodAmounts[index];
    }
    periodAmounts[periodIndex] = editedAmount;

    const totalAmount = roundMoney(targetAmount);
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
        installmentConfig: {
          ...item.installmentConfig,
          enabled: true,
          months,
          periodUnit,
          periodAmounts,
          periodLocked,
          periodProgress,
          periodRemarks,
          monthlyAmount,
          totalAmount,
          versions: createInstallmentVersions(
            item,
            previousPeriodAmounts,
            previousPeriodProgress,
            previousPeriodRemarks,
            'Amount update',
          ),
        },
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleOverallInstallmentPeriodAmountSave = async (
    periodIndex: number,
    value: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isFinite(value)
      || value < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const editedAmount = roundMoney(value);
    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromOverallPlan(options.selectedBudget, periodCount, targetAmount);

    periodAmounts[periodIndex] = editedAmount;
    periodLocked[periodIndex] = true;
    const lockedIndexes = new Set<number>();
    for (let index = 0; index <= periodIndex; index += 1) {
      lockedIndexes.add(index);
    }
    periodLocked.forEach((isLocked, index) => {
      if (isLocked) {
        lockedIndexes.add(index);
      }
    });
    periodProgress.forEach((isDone, index) => {
      if (isDone) {
        lockedIndexes.add(index);
      }
    });
    const adjustableIndexes = Array.from({ length: periodCount }, (_, index) => index)
      .filter((index) => index > periodIndex && !lockedIndexes.has(index));
    const lockedTotal = Array.from(lockedIndexes)
      .reduce((total, index) => total + (periodAmounts[index] ?? 0), 0);
    if (adjustableIndexes.length > 0) {
      distributeRemainingInstallmentAmount(periodAmounts, adjustableIndexes, targetAmount, lockedTotal);
    }
    periodAmounts[periodIndex] = editedAmount;

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateOverallInstallmentPlan({
        budgetId: options.selectedBudget.id,
        periodAmounts,
        periodLocked,
        periodProgress,
        periodRemarks,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleOverallInstallmentProgressSave = async (
    periodIndex: number,
    checked: boolean,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromOverallPlan(options.selectedBudget, periodCount, targetAmount);
    periodProgress[periodIndex] = checked;

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateOverallInstallmentPlan({
        budgetId: options.selectedBudget.id,
        periodAmounts,
        periodLocked,
        periodProgress,
        periodRemarks,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleOverallInstallmentRemarkSave = async (
    periodIndex: number,
    remark: string,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const nextRemark = remark.trim();
    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromOverallPlan(options.selectedBudget, periodCount, targetAmount);
    if ((periodRemarks[periodIndex] ?? '') === nextRemark) {
      return;
    }
    periodRemarks[periodIndex] = nextRemark;

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateOverallInstallmentPlan({
        budgetId: options.selectedBudget.id,
        periodAmounts,
        periodLocked,
        periodProgress,
        periodRemarks,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleInstallmentPeriodReset = async (
    item: BudgetItem,
    periodIndex: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const periodUnit = options.selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...periodAmounts];
    const previousPeriodProgress = [...periodProgress];
    const previousPeriodRemarks = [...periodRemarks];

    resetInstallmentPeriodState(periodAmounts, periodLocked, periodProgress, periodRemarks, periodIndex, targetAmount);
    const totalAmount = roundMoney(targetAmount);
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
        installmentConfig: {
          ...item.installmentConfig,
          enabled: true,
          months,
          periodUnit,
          paidMonths: periodProgress.filter(Boolean).length,
          periodAmounts,
          periodLocked,
          periodProgress,
          periodRemarks,
          monthlyAmount,
          totalAmount,
          versions: createInstallmentVersions(
            item,
            previousPeriodAmounts,
            previousPeriodProgress,
            previousPeriodRemarks,
            'Period reset',
          ),
        },
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleOverallInstallmentPeriodReset = async (
    periodIndex: number,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const {
      periodAmounts,
      periodLocked,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromOverallPlan(options.selectedBudget, periodCount, targetAmount);

    resetInstallmentPeriodState(periodAmounts, periodLocked, periodProgress, periodRemarks, periodIndex, targetAmount);

    setIsBudgetItemSaving(true);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await updateOverallInstallmentPlan({
        budgetId: options.selectedBudget.id,
        periodAmounts,
        periodLocked,
        periodProgress,
        periodRemarks,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleInstallmentProgressSave = async (
    item: BudgetItem,
    periodIndex: number,
    checked: boolean,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const periodUnit = options.selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const {
      periodAmounts,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    const previousPeriodAmounts = [...periodAmounts];
    const previousPeriodProgress = [...periodProgress];
    const previousPeriodRemarks = [...periodRemarks];
    periodProgress[periodIndex] = checked;
    const totalAmount = roundMoney(targetAmount);
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
        installmentConfig: {
          ...item.installmentConfig,
          enabled: true,
          months,
          periodUnit,
          paidMonths: periodProgress.filter(Boolean).length,
          periodAmounts,
          periodProgress,
          periodRemarks,
          monthlyAmount,
          totalAmount,
          versions: createInstallmentVersions(
            item,
            previousPeriodAmounts,
            previousPeriodProgress,
            previousPeriodRemarks,
            'Progress update',
          ),
        },
        split: item.split,
        sortOrder: item.sortOrder,
      }));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsBudgetItemSaving(false);
    }
  };

  const handleInstallmentRemarkSave = async (
    item: BudgetItem,
    periodIndex: number,
    remark: string,
    periodCount: number,
    targetAmount: number,
  ) => {
    if (
      options.selectedBudget === null
      || !Number.isInteger(periodIndex)
      || periodIndex < 0
      || !Number.isInteger(periodCount)
      || periodCount <= 0
      || periodIndex >= periodCount
      || !Number.isFinite(targetAmount)
      || targetAmount <= 0
    ) {
      return;
    }

    const nextRemark = remark.trim();
    const periodUnit = options.selectedBudget.installmentPeriodUnit;
    const months = item.installmentConfig.months
      ?? installmentMonthsFromPeriodCount(periodCount, periodUnit);
    const {
      periodAmounts,
      periodProgress,
      periodRemarks,
    } = installmentPeriodStateFromItem(item, periodCount, targetAmount);
    if ((periodRemarks[periodIndex] ?? '') === nextRemark) {
      return;
    }

    const previousPeriodAmounts = [...periodAmounts];
    const previousPeriodProgress = [...periodProgress];
    const previousPeriodRemarks = [...periodRemarks];
    periodRemarks[periodIndex] = nextRemark;
    const totalAmount = roundMoney(targetAmount);
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
        pricingConfig: pricingConfigForBudget(options.selectedBudget, item.pricingConfig),
        installmentConfig: {
          ...item.installmentConfig,
          enabled: true,
          months,
          periodUnit,
          paidMonths: periodProgress.filter(Boolean).length,
          periodAmounts,
          periodProgress,
          periodRemarks,
          monthlyAmount,
          totalAmount,
          versions: createInstallmentVersions(
            item,
            previousPeriodAmounts,
            previousPeriodProgress,
            previousPeriodRemarks,
            'Remark update',
          ),
        },
        split: item.split,
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

    if (options.selectedBudget.pricingEnabled) {
      setEntryError(translateCurrent('unitPricingQuickEditBlocked'));

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
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          options.selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(
          transaction,
          options.selectedBudget,
          value,
        ),
        pricingConfig: transactionPricingConfigForBudget(options.selectedBudget, transaction),
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
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          options.selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(transaction, options.selectedBudget),
        pricingConfig: transactionPricingConfigForBudget(options.selectedBudget, transaction),
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

  const handleTransactionQuickUnitPriceSave = async (
    transaction: Transaction,
    value: number,
  ) => {
    if (options.selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    const pricingConfig = transactionPricingConfigWithChange(
      transaction,
      options.selectedBudget,
      { unitPrice: value },
    );
    if (pricingConfig.totalAmount === null) {
      return;
    }

    const nextUnitPrice = pricingConfig.unitPrice ?? transaction.amountOriginal;
    if (
      transaction.pricingConfig.enabled
      && Math.abs((transaction.pricingConfig.unitPrice ?? transaction.amountOriginal) - nextUnitPrice) < 0.005
      && Math.abs(transaction.amountOriginal - pricingConfig.totalAmount) < 0.005
    ) {
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
        amount: pricingConfig.totalAmount,
        rate: transaction.rateToBase,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          options.selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(
          transaction,
          options.selectedBudget,
          pricingConfig.totalAmount,
        ),
        pricingConfig,
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

  const handleTransactionQuickQuantitySave = async (
    transaction: Transaction,
    value: number,
  ) => {
    if (options.selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    const pricingConfig = transactionPricingConfigWithChange(
      transaction,
      options.selectedBudget,
      { quantity: value },
    );
    if (pricingConfig.totalAmount === null) {
      return;
    }

    const nextQuantity = pricingConfig.quantity ?? 1;
    if (
      transaction.pricingConfig.enabled
      && Math.abs((transaction.pricingConfig.quantity ?? 1) - nextQuantity) < 0.005
      && Math.abs(transaction.amountOriginal - pricingConfig.totalAmount) < 0.005
    ) {
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
        amount: pricingConfig.totalAmount,
        rate: transaction.rateToBase,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          options.selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(
          transaction,
          options.selectedBudget,
          pricingConfig.totalAmount,
        ),
        pricingConfig,
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
        paidByParticipantId: defaultTransactionPaidByParticipantId(options.selectedBudget, categoryId),
        payments: defaultTransactionPaymentRows(options.selectedBudget, categoryId)
          .map((row) => ({
            participantId: row.participantId ?? 0,
            amount: row.amount ?? 0,
          }))
          .filter((row) => row.participantId > 0 && row.amount > 0),
        pricingConfig: transactionPricingConfigForBudget(options.selectedBudget, transaction),
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
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          options.selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(transaction, options.selectedBudget),
        pricingConfig: transactionPricingConfigForBudget(options.selectedBudget, transaction),
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
    handleOverallInstallmentPeriodAmountSave,
    handleInstallmentPeriodReset,
    handleOverallInstallmentPeriodReset,
    handleInstallmentProgressSave,
    handleOverallInstallmentProgressSave,
    handleInstallmentRemarkSave,
    handleOverallInstallmentRemarkSave,
    handleInstallmentHistoryClear,
    handleInstallmentAmountsReset,
    handleBudgetItemRateRefresh,
    openTransactionCreateModal,
    openTransactionEditModal,
    closeTransactionModal,
    handleTransactionSave,
    handleTransactionCategoryChange,
    handleTransactionRateRefresh,
    handleTransactionReferenceConvert,
    clearEntryError,
    handleTransactionQuickAmountSave,
    handleTransactionQuickCurrencySave,
    handleTransactionQuickUnitPriceSave,
    handleTransactionQuickQuantitySave,
    handleTransactionCategoryQuickSave,
    handleTransactionQuickRemarkSave,
    handleTransactionDelete,
  };
}

function normalizedAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedNonNegativeAmount(value: number | null | undefined): number | null {
  const amount = normalizedAmount(value);

  return amount === null || amount < 0 ? null : amount;
}

function emptyPricingConfig(): BudgetItem['pricingConfig'] {
  return {
    enabled: false,
    unitPrice: null,
    quantity: null,
    totalAmount: null,
  };
}

function pricingConfigForBudget(
  budget: BudgetDetail,
  config: BudgetItem['pricingConfig'],
): BudgetItem['pricingConfig'] {
  return budget.pricingEnabled ? config : emptyPricingConfig();
}

function pricingConfigFromForm(
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

function pricingTotalFromForm(
  config: BudgetItemFormValues['pricingConfig'],
  pricingEnabled: boolean,
): number | null {
  const pricingConfig = pricingConfigFromForm(config, pricingEnabled);

  return pricingConfig.enabled ? pricingConfig.totalAmount : null;
}

function transactionPricingConfigForCreateForm(
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

function transactionPricingConfigForEditForm(
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

function transactionPricingConfigForBudget(
  budget: BudgetDetail,
  transaction: Transaction,
): BudgetItem['pricingConfig'] {
  return transactionPricingConfigForEditForm(transaction, budget);
}

function transactionPricingConfigWithChange(
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

function transactionPricingConfigFromForm(
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

function transactionPricingTotalFromForm(
  config: TransactionFormValues['pricingConfig'],
  pricingEnabled: boolean,
): number | null {
  const pricingConfig = transactionPricingConfigFromForm(config, pricingEnabled);

  return pricingConfig.enabled ? pricingConfig.totalAmount : null;
}

function itemBudgetAmountFormValue(item: BudgetItem): number | undefined {
  return item.budget.amountOriginal === 0 && item.budget.amountBase === 0
    ? undefined
    : item.budget.amountOriginal;
}

function defaultSplitFormValue(budget: BudgetDetail): BudgetItemFormValues['split'] {
  if (budget.participantMode !== 'group' || budget.participants.length === 0) {
    return undefined;
  }

  return {
    paidByParticipantId: budget.participants[0].id,
    splitType: 'equal',
    participantIds: budget.participants.map((participant) => participant.id),
    individualAmounts: budget.participants.map((participant) => ({
      participantId: participant.id,
      amountBase: null,
    })),
    note: null,
  };
}

function splitToFormValue(
  item: BudgetItem,
  budget: BudgetDetail | null,
): BudgetItemFormValues['split'] {
  if (budget === null || budget.participantMode !== 'group' || budget.participants.length === 0) {
    return undefined;
  }

  if (item.split === null) {
    return defaultSplitFormValue(budget);
  }

  return {
    paidByParticipantId: item.split.paidByParticipantId,
    splitType: item.split.splitType,
    participantIds: item.split.participants
      .filter((participant) => participant.isIncluded)
      .map((participant) => participant.participantId),
    individualAmounts: budget.participants.map((participant) => {
      const splitParticipant = item.split?.participants.find(
        (itemParticipant) => itemParticipant.participantId === participant.id,
      );

      return {
        participantId: participant.id,
        amountBase: splitParticipant?.shareAmountBase ?? null,
      };
    }),
    note: item.split.note,
  };
}

function splitPayloadFromForm(
  values: BudgetItemFormValues,
  budget: BudgetDetail,
): BudgetItemSplit | null {
  if (budget.participantMode !== 'group' || budget.participants.length === 0) {
    return null;
  }

  const split = values.split ?? defaultSplitFormValue(budget);
  if (split === undefined) {
    return null;
  }

  const splitType = split.splitType ?? 'equal';
  if (splitType === 'individual') {
    const amountByParticipantId = new Map<number, number | null>();
    (split.individualAmounts ?? []).forEach((row) => {
      if (typeof row?.participantId !== 'number') {
        return;
      }

      amountByParticipantId.set(
        row.participantId,
        typeof row.amountBase === 'number' && Number.isFinite(row.amountBase) && row.amountBase > 0
          ? roundMoney(row.amountBase)
          : null,
      );
    });

    return {
      paidByParticipantId: null,
      splitType,
      note: split.note?.trim() || null,
      participants: budget.participants.map((participant) => ({
        participantId: participant.id,
        isIncluded: true,
        shareRatio: null,
        shareAmountBase: amountByParticipantId.get(participant.id) ?? null,
      })),
    };
  }

  const selectedParticipantIds = new Set(
    splitType === 'excluded'
      ? []
      : (split.participantIds ?? budget.participants.map((participant) => participant.id)),
  );

  return {
    paidByParticipantId: splitType === 'per_person' ? null : split.paidByParticipantId ?? null,
    splitType,
    note: split.note?.trim() || null,
    participants: budget.participants
      .filter((participant) => selectedParticipantIds.has(participant.id))
      .map((participant) => ({
        participantId: participant.id,
        isIncluded: true,
        shareRatio: null,
        shareAmountBase: null,
      })),
  };
}

function defaultTransactionPaidByParticipantId(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): number | null {
  if (!transactionCategorySupportsTransactionPayments(budget, categoryId)) {
    return null;
  }

  const item = transactionItemForCategory(budget, categoryId);
  if (item === null) {
    return null;
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  const paidByParticipantId = item.split?.paidByParticipantId ?? null;
  if (paidByParticipantId !== null && participantIds.has(paidByParticipantId)) {
    return paidByParticipantId;
  }

  return budget.participants[0]?.id ?? null;
}

function transactionPaidByParticipantIdFromForm(
  values: TransactionFormValues,
  budget: BudgetDetail | null,
): number | null {
  if ((values.paymentMode ?? 'single') === 'multiple') {
    return null;
  }

  const fallbackPaidByParticipantId = defaultTransactionPaidByParticipantId(
    budget,
    values.categoryId,
  );
  if (fallbackPaidByParticipantId === null || budget === null) {
    return null;
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  return typeof values.paidByParticipantId === 'number'
    && participantIds.has(values.paidByParticipantId)
    ? values.paidByParticipantId
    : fallbackPaidByParticipantId;
}

function defaultTransactionPaymentRows(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): NonNullable<TransactionFormValues['payments']> {
  if (!transactionCategorySupportsTransactionPayments(budget, categoryId)) {
    return [];
  }

  return budget.participants.map((participant) => ({
    participantId: participant.id,
    amount: null,
  }));
}

function transactionPaymentRowsToForm(
  transaction: Transaction,
  budget: BudgetDetail | null,
): NonNullable<TransactionFormValues['payments']> {
  const rows = defaultTransactionPaymentRows(budget, transaction.categoryId);
  if (rows.length === 0) {
    return [];
  }

  const amountByParticipantId = new Map(
    transaction.payments.map((payment) => [payment.participantId, payment.amountOriginal]),
  );
  if (amountByParticipantId.size === 0 && transaction.paidByParticipantId !== null) {
    amountByParticipantId.set(transaction.paidByParticipantId, transaction.amountOriginal);
  }

  return rows.map((row) => ({
    participantId: row.participantId,
    amount: row.participantId === undefined
      ? null
      : amountByParticipantId.get(row.participantId) ?? null,
  }));
}

function transactionPaymentsFromForm(
  values: TransactionFormValues,
  budget: BudgetDetail | null,
  amount: number,
): SaveTransactionPayload['payments'] {
  if (
    (values.paymentMode ?? 'single') !== 'multiple'
    || !transactionCategorySupportsTransactionPayments(budget, values.categoryId)
  ) {
    return [];
  }

  const participantIds = new Set(budget.participants.map((participant) => participant.id));
  const payments = (values.payments ?? [])
    .filter((row): row is { participantId: number; amount: number } =>
      typeof row?.participantId === 'number'
      && participantIds.has(row.participantId)
      && typeof row.amount === 'number'
      && Number.isFinite(row.amount)
      && row.amount > 0,
    )
    .map((row) => ({
      participantId: row.participantId,
      amount: roundMoney(row.amount),
    }));

  const paymentTotal = roundMoney(payments.reduce((total, payment) => total + payment.amount, 0));
  if (Math.abs(paymentTotal - roundMoney(amount)) > 0.01) {
    throw new Error(translateCurrent('transactionPaymentTotalMismatch'));
  }

  return payments;
}

function transactionPaidByParticipantIdForQuickSave(
  transaction: Transaction,
  budget: BudgetDetail | null,
): number | null {
  return transactionCategorySupportsTransactionPayments(budget, transaction.categoryId ?? undefined)
    ? transaction.paidByParticipantId
    : null;
}

function transactionPaymentPayloadForQuickSave(
  transaction: Transaction,
  budget: BudgetDetail | null,
  nextAmount?: number,
): SaveTransactionPayload['payments'] {
  if (!transactionCategorySupportsTransactionPayments(budget, transaction.categoryId ?? undefined)) {
    return [];
  }

  if (transaction.payments.length === 0) {
    return [];
  }

  if (typeof nextAmount !== 'number' || !Number.isFinite(nextAmount)) {
    return transaction.payments.map((payment) => ({
      participantId: payment.participantId,
      amount: payment.amountOriginal,
    }));
  }

  const currentTotal = roundMoney(transaction.payments.reduce(
    (total, payment) => total + payment.amountOriginal,
    0,
  ));
  if (currentTotal <= 0) {
    return [];
  }

  let distributedTotal = 0;
  return transaction.payments.map((payment, index) => {
    const isLast = index === transaction.payments.length - 1;
    const amount = isLast
      ? roundMoney(nextAmount - distributedTotal)
      : roundMoney(nextAmount * payment.amountOriginal / currentTotal);
    distributedTotal = roundMoney(distributedTotal + amount);

    return {
      participantId: payment.participantId,
      amount: Math.max(0, amount),
    };
  }).filter((payment) => payment.amount > 0);
}

function transactionItemForCategory(
  budget: BudgetDetail,
  categoryId: number | null | undefined,
): BudgetItem | null {
  if (typeof categoryId !== 'number') {
    return null;
  }

  return budget.items.find((item) => item.categoryId === categoryId) ?? null;
}

function splitTypeSupportsTransactionPayments(splitType: BudgetItemSplit['splitType']): boolean {
  return splitType !== 'excluded' && splitType !== 'per_person';
}

function transactionCategorySupportsTransactionPayments(
  budget: BudgetDetail | null,
  categoryId: number | null | undefined,
): budget is BudgetDetail {
  if (budget === null || budget.participantMode !== 'group' || budget.participants.length === 0) {
    return false;
  }

  const item = transactionItemForCategory(budget, categoryId);

  return item !== null && splitTypeSupportsTransactionPayments(item.split?.splitType ?? 'equal');
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function installmentPeriodStateFromItem(
  item: BudgetItem,
  periodCount: number,
  targetAmount: number,
): {
  periodAmounts: number[];
  periodLocked: boolean[];
  periodProgress: boolean[];
  periodRemarks: string[];
} {
  const defaultAmount = roundMoney(targetAmount / periodCount);

  return {
    periodAmounts: Array.from({ length: periodCount }, (_, index) =>
      roundMoney(item.installmentConfig.periodAmounts[index] ?? defaultAmount),
    ),
    periodLocked: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodLocked[index] === true,
    ),
    periodProgress: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodProgress[index] === true,
    ),
    periodRemarks: Array.from({ length: periodCount }, (_, index) =>
      item.installmentConfig.periodRemarks[index] ?? '',
    ),
  };
}

function installmentPeriodStateFromOverallPlan(
  budget: BudgetDetail,
  periodCount: number,
  targetAmount: number,
): {
  periodAmounts: number[];
  periodLocked: boolean[];
  periodProgress: boolean[];
  periodRemarks: string[];
} {
  const defaultAmounts = splitMoneyAcrossPeriods(targetAmount, periodCount);

  return {
    periodAmounts: Array.from({ length: periodCount }, (_, index) =>
      roundMoney(budget.overallInstallmentPlan.periodAmounts[index] ?? defaultAmounts[index] ?? 0),
    ),
    periodLocked: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodLocked[index] === true,
    ),
    periodProgress: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodProgress[index] === true,
    ),
    periodRemarks: Array.from({ length: periodCount }, (_, index) =>
      budget.overallInstallmentPlan.periodRemarks[index] ?? '',
    ),
  };
}

function installmentPeriodCountForItem(item: BudgetItem, budget: BudgetDetail): number | null {
  const months =
    item.installmentConfig.months
    ?? budgetDurationMonths(budget.startDate, budget.endDate);
  if (months === null) {
    return null;
  }

  return Math.max(1, Math.ceil(periodCountFromMonths(months, budget.installmentPeriodUnit)));
}

function resetInstallmentTargetAmount(item: BudgetItem, budget: BudgetDetail): number {
  return roundMoney(effectiveBudgetItemAmounts(item, budget.transactions).budgetAmountOriginal);
}

function splitMoneyAcrossPeriods(totalAmount: number, periodCount: number): number[] {
  const averageAmount = roundMoney(totalAmount / periodCount);
  let assignedTotal = 0;

  return Array.from({ length: periodCount }, (_, index) => {
    const isLast = index === periodCount - 1;
    const amount = isLast ? roundMoney(totalAmount - assignedTotal) : averageAmount;
    assignedTotal = roundMoney(assignedTotal + amount);

    return amount;
  });
}

function budgetDurationMonths(startDate: string | null, endDate: string | null): number | null {
  if (startDate === null || endDate === null) {
    return null;
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return null;
  }

  return Math.max(1, (end.diff(start, 'day') + 1) / 30.4375);
}

function periodCountFromMonths(months: number, unit: BudgetDetail['installmentPeriodUnit']): number {
  if (unit === 'day') {
    return months * (365 / 12);
  }

  if (unit === 'week') {
    return months * (52 / 12);
  }

  if (unit === 'year') {
    return months / 12;
  }

  return months;
}

function distributeRemainingInstallmentAmount(
  periodAmounts: number[],
  adjustableIndexes: number[],
  targetAmount: number,
  lockedTotal: number,
) {
  const remainingAmount = Math.max(0, roundMoney(targetAmount - lockedTotal));
  const averageAmount = roundMoney(remainingAmount / adjustableIndexes.length);
  let assignedTotal = 0;
  adjustableIndexes.forEach((index, position) => {
    const isLast = position === adjustableIndexes.length - 1;
    const nextAmount = isLast ? roundMoney(remainingAmount - assignedTotal) : averageAmount;
    periodAmounts[index] = nextAmount;
    assignedTotal = roundMoney(assignedTotal + nextAmount);
  });
}

function resetInstallmentPeriodState(
  periodAmounts: number[],
  periodLocked: boolean[],
  periodProgress: boolean[],
  periodRemarks: string[],
  periodIndex: number,
  targetAmount: number,
) {
  periodLocked[periodIndex] = false;
  periodProgress[periodIndex] = false;
  periodRemarks[periodIndex] = '';

  const lockedIndexes = new Set<number>();
  for (let index = 0; index < periodIndex; index += 1) {
    lockedIndexes.add(index);
  }
  periodLocked.forEach((isLocked, index) => {
    if (isLocked) {
      lockedIndexes.add(index);
    }
  });
  periodProgress.forEach((isDone, index) => {
    if (isDone) {
      lockedIndexes.add(index);
    }
  });

  const adjustableIndexes = periodAmounts
    .map((_amount, index) => index)
    .filter((index) => !lockedIndexes.has(index));
  const lockedTotal = Array.from(lockedIndexes)
    .reduce((total, index) => total + (periodAmounts[index] ?? 0), 0);
  if (adjustableIndexes.length > 0) {
    distributeRemainingInstallmentAmount(periodAmounts, adjustableIndexes, targetAmount, lockedTotal);
  }
}

function createInstallmentVersions(
  item: BudgetItem,
  periodAmounts: number[],
  periodProgress: boolean[],
  periodRemarks: string[],
  label: string,
): BudgetItem['installmentConfig']['versions'] {
  return [
    {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      label,
      periodAmounts,
      periodProgress,
      periodRemarks,
      totalAmount: item.installmentConfig.totalAmount
        ?? roundMoney(periodAmounts.reduce((total, amount) => total + amount, 0)),
    },
    ...item.installmentConfig.versions,
  ].slice(0, 25);
}

function originalAmountFromBase(amountBase: number, rateToBase: number): number {
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) {
    return roundMoney(amountBase);
  }

  return roundMoney(amountBase / rateToBase);
}

function installmentMonthsFromPeriodCount(
  periodCount: number,
  unit: BudgetDetail['installmentPeriodUnit'],
): number {
  if (unit === 'day') {
    return Math.max(1, Math.ceil(periodCount * (12 / 365)));
  }

  if (unit === 'week') {
    return Math.max(1, Math.ceil(periodCount * (12 / 52)));
  }

  if (unit === 'year') {
    return Math.max(1, periodCount * 12);
  }

  return periodCount;
}

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
