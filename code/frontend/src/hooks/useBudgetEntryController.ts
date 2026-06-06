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
      setEntryError('Select a budget before adding highlights.');

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
      budgetRate: item.budget.rateToBase,
      estimatedCurrency: item.estimatedActuals.currency,
      estimatedAmount: item.estimatedActuals.amountOriginal,
      estimatedRate: item.estimatedActuals.rateToBase,
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
      setEntryError('Select a budget before adding highlights.');

      return;
    }

    try {
      const values = await budgetItemForm.validateFields();
      setIsBudgetItemSaving(true);
      setEntryError(null);

      const payload: SaveBudgetItemPayload = {
        categoryId: values.categoryId,
        label: values.label.trim(),
        budgetCurrency: values.budgetCurrency,
        budgetAmount: values.budgetAmount,
        estimatedCurrency: values.estimatedCurrency,
        estimatedAmount: values.estimatedAmount,
        sortOrder: values.sortOrder ?? 0,
      };
      if (values.budgetRate !== undefined) {
        payload.budgetRate = values.budgetRate;
      }
      if (values.estimatedRate !== undefined) {
        payload.estimatedRate = values.estimatedRate;
      }
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

  const handleBudgetItemDelete = async (id: number) => {
    setDeletingBudgetItemId(id);
    setEntryError(null);

    try {
      options.replaceBudgetDetail(await deleteBudgetItem(id));
    } catch (error: unknown) {
      setEntryError(error instanceof Error ? error.message : 'Failed to delete budget item.');
    } finally {
      setDeletingBudgetItemId(null);
    }
  };

  const openTransactionCreateModal = () => {
    if (options.selectedBudget === null) {
      setEntryError('Select a budget before adding transactions.');

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
      setEntryError('Select a budget before adding transactions.');

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
      setEntryError(error instanceof Error ? error.message : 'Failed to delete transaction.');
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

export type BudgetEntryController = ReturnType<typeof useBudgetEntryController>;
