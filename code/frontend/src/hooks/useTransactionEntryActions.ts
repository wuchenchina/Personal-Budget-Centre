import { useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type SaveTransactionPayload,
} from '../api/budgetEntries';
import { convertCurrency, refreshBochkRates } from '../api/exchangeRates';
import { translateCurrent } from '../i18n';
import type { BudgetDetail, CurrencyCode, Transaction } from '../types/budget';
import type { TransactionFormValues } from '../types/forms';
import { normalizedAmount, roundMoney } from './budgetEntryMath';
import {
  transactionPricingConfigForBudget,
  transactionPricingConfigForCreateForm,
  transactionPricingConfigForEditForm,
  transactionPricingConfigFromForm,
  transactionPricingConfigWithChange,
  transactionPricingTotalFromForm,
} from './budgetEntryPricing';
import {
  defaultTransactionPaidByParticipantId,
  defaultTransactionPaymentRows,
  transactionCategorySupportsTransactionPayments,
  transactionPaidByParticipantIdForQuickSave,
  transactionPaidByParticipantIdFromForm,
  transactionPaymentPayloadForQuickSave,
  transactionPaymentRowsToForm,
  transactionPaymentsFromForm,
} from './budgetEntryTransactions';

interface TransactionEntryActionsOptions {
  baseCurrency: CurrencyCode;
  selectedBudget: BudgetDetail | null;
  replaceBudgetDetail: (budget: BudgetDetail) => void;
  resolveRate: (fromCurrency: CurrencyCode, toCurrency: CurrencyCode) => Promise<number>;
  setEntryError: (error: string | null) => void;
}

export function useTransactionEntryActions({
  baseCurrency,
  selectedBudget,
  replaceBudgetDetail,
  resolveRate,
  setEntryError,
}: TransactionEntryActionsOptions) {
  const [transactionForm] = Form.useForm<TransactionFormValues>();
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isTransactionSaving, setIsTransactionSaving] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const entryCurrency = selectedBudget?.displayCurrency ?? baseCurrency;

  const closeTransactionModal = () => {
    setIsTransactionModalOpen(false);
    setEditingTransaction(null);
    setEntryError(null);
  };

  const handleTransactionRateRefresh = async () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      await refreshBochkRates(selectedBudget.workspaceId);
      const values = transactionForm.getFieldsValue();
      const rate = await resolveRate(values.currency, selectedBudget.baseCurrency);

      transactionForm.setFieldsValue({
        rate,
      });
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const convertedTransactionReferenceAmount = async (
    values: TransactionFormValues,
    rateToBase: number,
  ): Promise<number> => {
    if (selectedBudget === null) {
      throw new Error(translateCurrent('selectBudgetFirst'));
    }

    const pricingTotal = transactionPricingTotalFromForm(values.pricingConfig, selectedBudget.pricingEnabled);
    const amount = pricingTotal ?? normalizedAmount(values.amount);
    if (amount === null) {
      throw new Error(translateCurrent('amountRequired'));
    }

    if (values.referenceCurrency === undefined) {
      throw new Error(translateCurrent('selectReferenceCurrency'));
    }

    const baseAmount = roundMoney(amount * rateToBase);
    if (values.referenceCurrency === selectedBudget.baseCurrency) {
      return baseAmount;
    }

    const conversion = await convertCurrency({
      workspaceId: selectedBudget.workspaceId,
      fromCurrency: selectedBudget.baseCurrency,
      toCurrency: values.referenceCurrency,
      amount: baseAmount,
      rateDate: values.transactionDate?.format('YYYY-MM-DD'),
    });

    return roundMoney(conversion.convertedAmount);
  };

  const handleTransactionReferenceConvert = async () => {
    if (selectedBudget === null) {
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
        ?? await resolveRate(values.currency, selectedBudget.baseCurrency);
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

  const openTransactionCreateModal = () => {
    if (selectedBudget === null) {
      setEntryError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setEntryError(null);
    setEditingTransaction(null);
    transactionForm.resetFields();
    const firstCategoryId = selectedBudget.items
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
        selectedBudget,
        firstCategoryId,
      ) ?? undefined,
      payments: defaultTransactionPaymentRows(selectedBudget, firstCategoryId),
      transactionDate: dayjs(),
      currency: entryCurrency,
      rateScope: 'item',
      referenceCurrency: undefined,
      referenceAmount: undefined,
      pricingConfig: transactionPricingConfigForCreateForm(selectedBudget),
      sortOrder: selectedBudget.transactions.length + 1,
    });
    setIsTransactionModalOpen(true);
  };

  const openTransactionEditModal = (transaction: Transaction) => {
    setEntryError(null);
    setEditingTransaction(transaction);
    transactionForm.resetFields();
    const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
      selectedBudget,
      transaction.categoryId ?? undefined,
    );
    transactionForm.setFieldsValue({
      categoryId: transaction.categoryId ?? undefined,
      paymentMode:
        supportsTransactionPayments && transaction.payments.length > 0 ? 'multiple' : 'single',
      paidByParticipantId: supportsTransactionPayments
        ? transaction.paidByParticipantId
          ?? defaultTransactionPaidByParticipantId(
            selectedBudget,
            transaction.categoryId ?? undefined,
          )
          ?? undefined
        : null,
      payments: transactionPaymentRowsToForm(transaction, selectedBudget),
      transactionDate:
        transaction.transactionDate === null ? undefined : dayjs(transaction.transactionDate),
      details: transaction.details,
      currency: transaction.currency,
      amount: transaction.amountOriginal,
      rate: transaction.rateToBase,
      rateScope: 'item',
      pricingConfig: transactionPricingConfigForEditForm(transaction, selectedBudget),
      referenceCurrency: transaction.referenceCurrency ?? undefined,
      referenceAmount: transaction.referenceAmountOriginal ?? undefined,
      remark: transaction.remark ?? undefined,
      sortOrder: transaction.sortOrder,
    });
    setIsTransactionModalOpen(true);
  };

  const handleTransactionCategoryChange = (categoryId: number | null | undefined) => {
    if (selectedBudget === null) {
      return;
    }

    const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
      selectedBudget,
      categoryId,
    );

    transactionForm.setFieldsValue({
      paymentMode: supportsTransactionPayments
        ? transactionForm.getFieldValue('paymentMode') ?? 'single'
        : 'single',
      paidByParticipantId: defaultTransactionPaidByParticipantId(selectedBudget, categoryId),
      payments: defaultTransactionPaymentRows(selectedBudget, categoryId),
    });
  };

  const handleTransactionSave = async () => {
    if (selectedBudget === null && editingTransaction === null) {
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
        selectedBudget?.pricingEnabled === true,
      );
      const pricingTotal = pricingConfig.enabled ? pricingConfig.totalAmount : null;
      const transactionAmount = pricingTotal ?? normalizedAmount(values.amount);
      if (transactionAmount === null) {
        throw new Error(translateCurrent('amountRequired'));
      }
      const supportsTransactionPayments = transactionCategorySupportsTransactionPayments(
        selectedBudget,
        values.categoryId,
      );

      const payload: SaveTransactionPayload = {
        categoryId: values.categoryId,
        paidByParticipantId: transactionPaidByParticipantIdFromForm(values, selectedBudget),
        paymentMode: supportsTransactionPayments ? values.paymentMode ?? 'single' : 'single',
        payments: transactionPaymentsFromForm(values, selectedBudget, transactionAmount),
        transactionDate: values.transactionDate?.format('YYYY-MM-DD') ?? null,
        details: values.details.trim(),
        currency: values.currency,
        amount: transactionAmount,
        rateScope: values.rateScope ?? 'item',
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
              budgetId: selectedBudget?.id ?? 0,
            })
          : await updateTransaction({
              ...payload,
              id: editingTransaction.id,
            });

      replaceBudgetDetail(savedBudget);
      closeTransactionModal();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setEntryError(error.message);
      }
    } finally {
      setIsTransactionSaving(false);
    }
  };

  const handleTransactionQuickAmountSave = async (
    transaction: Transaction,
    value: number,
  ) => {
    if (selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    if (selectedBudget.pricingEnabled) {
      setEntryError(translateCurrent('unitPricingQuickEditBlocked'));

      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: value,
        rate: transaction.rateToBase,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(
          transaction,
          selectedBudget,
        ),
        payments: transactionPaymentPayloadForQuickSave(transaction, selectedBudget, value),
        pricingConfig: transactionPricingConfigForBudget(selectedBudget, transaction),
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
    if (selectedBudget === null || transaction.currency === currency) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency,
        amount: transaction.amountOriginal,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(transaction, selectedBudget),
        payments: transactionPaymentPayloadForQuickSave(transaction, selectedBudget),
        pricingConfig: transactionPricingConfigForBudget(selectedBudget, transaction),
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
    if (selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    const pricingConfig = transactionPricingConfigWithChange(transaction, selectedBudget, { unitPrice: value });
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

    await saveTransactionWithPricingConfig(transaction, pricingConfig);
  };

  const handleTransactionQuickQuantitySave = async (
    transaction: Transaction,
    value: number,
  ) => {
    if (selectedBudget === null || !Number.isFinite(value) || value < 0) {
      return;
    }

    const pricingConfig = transactionPricingConfigWithChange(transaction, selectedBudget, { quantity: value });
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

    await saveTransactionWithPricingConfig(transaction, pricingConfig);
  };

  const saveTransactionWithPricingConfig = async (
    transaction: Transaction,
    pricingConfig: Transaction['pricingConfig'],
  ) => {
    if (selectedBudget === null || pricingConfig.totalAmount === null) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: pricingConfig.totalAmount,
        rate: transaction.rateToBase,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(transaction, selectedBudget),
        payments: transactionPaymentPayloadForQuickSave(
          transaction,
          selectedBudget,
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
    if (selectedBudget === null || !Number.isInteger(categoryId)) {
      return;
    }

    setIsTransactionSaving(true);
    setEntryError(null);

    try {
      replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: transaction.amountOriginal,
        rate: transaction.rateToBase,
        paidByParticipantId: defaultTransactionPaidByParticipantId(selectedBudget, categoryId),
        payments: defaultTransactionPaymentRows(selectedBudget, categoryId)
          .map((row) => ({
            participantId: row.participantId ?? 0,
            amount: row.amount ?? 0,
          }))
          .filter((row) => row.participantId > 0 && row.amount > 0),
        pricingConfig: transactionPricingConfigForBudget(selectedBudget, transaction),
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
    if (selectedBudget === null) {
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
      replaceBudgetDetail(await updateTransaction({
        id: transaction.id,
        categoryId: transaction.categoryId ?? undefined,
        transactionDate: transaction.transactionDate,
        details: transaction.details,
        currency: transaction.currency,
        amount: transaction.amountOriginal,
        rate: transaction.rateToBase,
        paidByParticipantId: transactionPaidByParticipantIdForQuickSave(transaction, selectedBudget),
        payments: transactionPaymentPayloadForQuickSave(transaction, selectedBudget),
        pricingConfig: transactionPricingConfigForBudget(selectedBudget, transaction),
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
      replaceBudgetDetail(await deleteTransaction(id));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setDeletingTransactionId(null);
    }
  };

  return {
    transactionForm,
    isTransactionModalOpen,
    isTransactionSaving,
    editingTransaction,
    deletingTransactionId,
    openTransactionCreateModal,
    openTransactionEditModal,
    closeTransactionModal,
    handleTransactionSave,
    handleTransactionCategoryChange,
    handleTransactionRateRefresh,
    handleTransactionReferenceConvert,
    handleTransactionQuickAmountSave,
    handleTransactionQuickCurrencySave,
    handleTransactionQuickUnitPriceSave,
    handleTransactionQuickQuantitySave,
    handleTransactionCategoryQuickSave,
    handleTransactionQuickRemarkSave,
    handleTransactionDelete,
  };
}
