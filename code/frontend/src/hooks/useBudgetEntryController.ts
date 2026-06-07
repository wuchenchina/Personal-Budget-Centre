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

  const entryCurrency = options.selectedBudget?.displayCurrency ?? options.baseCurrency;

  const openBudgetItemCreateModal = () => {
    if (options.selectedBudget === null) {
      setEntryError('请先选择预算，再添加预算项。');

      return;
    }

    setEntryError(null);
    setEditingBudgetItem(null);
    budgetItemForm.resetFields();
    budgetItemForm.setFieldsValue({
      budgetCurrency: entryCurrency,
      estimatedCurrency: entryCurrency,
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
      budgetCurrency: item.budget.currency,
      budgetAmount: item.budget.amountOriginal,
      estimatedCurrency: item.estimatedActuals.currency,
      estimatedAmount: item.estimatedActuals.amountOriginal,
      sortOrder: item.sortOrder,
    });
    setIsBudgetItemModalOpen(true);
  };

  const closeBudgetItemModal = () => {
    setIsBudgetItemModalOpen(false);
    setEditingBudgetItem(null);
    budgetItemForm.resetFields();
  };

  const handleBudgetItemSave = async () => {
    if (options.selectedBudget === null && editingBudgetItem === null) {
      setEntryError('请先选择预算，再添加预算项。');

      return;
    }

    try {
      const values = await budgetItemForm.validateFields();
      setIsBudgetItemSaving(true);
      setEntryError(null);
      const amounts = await completeBudgetItemAmounts(values);

      const payload: SaveBudgetItemPayload = {
        categoryId: values.categoryId,
        label: values.label.trim(),
        budgetCurrency: values.budgetCurrency,
        budgetAmount: amounts.budgetAmount,
        estimatedCurrency: values.estimatedCurrency,
        estimatedAmount: amounts.estimatedAmount,
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
    const budgetAmount = normalizedAmount(values.budgetAmount);
    const estimatedAmount = normalizedAmount(values.estimatedAmount);

    if (budgetAmount === null) {
      return {
        budgetAmount: undefined,
        estimatedAmount: estimatedAmount ?? undefined,
      };
    }

    if (budgetAmount !== null && estimatedAmount !== null) {
      return { budgetAmount, estimatedAmount };
    }

    if (options.selectedBudget === null) {
      throw new Error('请先选择预算，再保存预算项。');
    }

    const bankFeeMultiplier = 1 + (normalizedBankFee(values.bankFee) ?? 0) / 100;
    return {
      budgetAmount,
      estimatedAmount: await convertedAmount({
        workspaceId: options.selectedBudget.workspaceId,
        fromCurrency: values.budgetCurrency,
        toCurrency: values.estimatedCurrency,
        amount: budgetAmount,
        multiplier: bankFeeMultiplier,
      }),
    };
  };

  const handleBudgetItemDelete = async (id: number) => {
    setDeletingBudgetItemId(id);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await deleteBudgetItem(id));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : '删除预算项失败。');
    } finally {
      setDeletingBudgetItemId(null);
    }
  };

  const openTransactionCreateModal = () => {
    if (options.selectedBudget === null) {
      setEntryError('请先选择预算，再添加交易。');

      return;
    }

    setEntryError(null);
    setEditingTransaction(null);
    transactionForm.resetFields();
    transactionForm.setFieldsValue({
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
      setEntryError('请先选择预算，再添加交易。');

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
      setEntryError(error instanceof Error ? error.message : '删除交易失败。');
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
    handleBudgetItemDelete,
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

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
