import { useEffect, useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
  createBookkeepingRecord,
  deleteBookkeepingRecord,
  listBookkeepingRecords,
  updateBookkeepingRecord,
} from '../api/bookkeeping';
import type { SaveBookkeepingRecordPayload } from '../api/bookkeeping';
import type { BookkeepingRecord, BudgetDetail, CurrencyCode } from '../types/budget';
import type { BookkeepingRecordFormValues } from '../types/forms';
import { translateCurrent } from '../i18n';

interface UseBookkeepingControllerOptions {
  baseCurrency: CurrencyCode;
  selectedBudget: BudgetDetail | null;
}

export function useBookkeepingController(options: UseBookkeepingControllerOptions) {
  const [form] = Form.useForm<BookkeepingRecordFormValues>();
  const [records, setRecords] = useState<BookkeepingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BookkeepingRecord | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const selectedBudgetId = options.selectedBudget?.id ?? null;

  useEffect(() => {
    let isMounted = true;
    if (selectedBudgetId === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setRecords([]);
        setError(null);
        setLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setLoading(true);
      void listBookkeepingRecords(selectedBudgetId)
        .then((nextRecords) => {
          if (isMounted) {
            setRecords(nextRecords);
            setError(null);
          }
        })
        .catch((loadError: unknown) => {
          if (isMounted) {
            setRecords([]);
            setError(loadError instanceof Error ? loadError.message : translateCurrent('loading'));
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [selectedBudgetId]);

  const openCreateModal = () => {
    if (options.selectedBudget === null) {
      setError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setEditingRecord(null);
    setError(null);
    form.resetFields();
    const defaultCurrency = options.selectedBudget.displayCurrency ?? options.selectedBudget.baseCurrency;
    form.setFieldsValue({
      transactionType: 'expense',
      recordDate: dayjs(),
      currency: defaultCurrency,
      rate: defaultCurrency === options.selectedBudget.baseCurrency ? 1 : undefined,
      rateScope: 'item',
      sortOrder: records.length + 1,
    });
    setModalOpen(true);
  };

  const openEditModal = (record: BookkeepingRecord) => {
    setEditingRecord(record);
    setError(null);
    form.resetFields();
    form.setFieldsValue({
      transactionType: record.transactionType,
      recordDate: record.recordDate === null ? undefined : dayjs(record.recordDate),
      orderReference: record.orderReference ?? undefined,
      details: record.details,
      categoryLabel: record.categoryLabel ?? undefined,
      sourceAccountName: record.sourceAccountName ?? undefined,
      destinationAccountName: record.destinationAccountName ?? undefined,
      currency: record.currency,
      amount: record.amountOriginal,
      rate: record.rateToBase,
      targetBaseAmount: record.amountBase,
      rateScope: 'item',
      destinationCurrency: record.destinationCurrency ?? undefined,
      destinationAmount: record.destinationAmountOriginal ?? undefined,
      destinationRate: record.destinationRate ?? undefined,
      remark: record.remark ?? undefined,
      sortOrder: record.sortOrder,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRecord(null);
    setError(null);
  };

  const saveRecord = async () => {
    if (options.selectedBudget === null) {
      setError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await form.validateFields();
      setSaving(true);
      setError(null);
      const payload: SaveBookkeepingRecordPayload = {
        transactionType: values.transactionType ?? 'expense',
        recordDate: values.recordDate?.format('YYYY-MM-DD') ?? null,
        orderReference: normalizedText(values.orderReference),
        details: values.details.trim(),
        categoryLabel: normalizedText(values.categoryLabel),
        sourceAccountName: normalizedText(values.sourceAccountName),
        destinationAccountName: normalizedText(values.destinationAccountName),
        currency: values.currency,
        amount: values.amount,
        rate: values.rate,
        rateScope: values.rateScope ?? 'item',
        destinationCurrency: normalizedAmount(values.destinationAmount) === null
          ? undefined
          : values.destinationCurrency,
        destinationAmount: normalizedAmount(values.destinationAmount),
        destinationRate: normalizedAmount(values.destinationRate) ?? undefined,
        remark: normalizedText(values.remark),
        sortOrder: values.sortOrder ?? 0,
      };
      const nextRecords = editingRecord === null
        ? await createBookkeepingRecord({
          ...payload,
          budgetId: options.selectedBudget.id,
        })
        : await updateBookkeepingRecord({
          ...payload,
          id: editingRecord.id,
        });

      setRecords(nextRecords);
      closeModal();
    } catch (saveError: unknown) {
      if (saveError instanceof Error) {
        setError(saveError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (id: number) => {
    setDeletingRecordId(id);
    setError(null);

    try {
      setRecords(await deleteBookkeepingRecord(id));
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : translateCurrent('authFailed'));
    } finally {
      setDeletingRecordId(null);
    }
  };

  return {
    form,
    records,
    error,
    loading,
    saving,
    modalOpen,
    editingRecord,
    deletingRecordId,
    openCreateModal,
    openEditModal,
    closeModal,
    saveRecord,
    deleteRecord,
  };
}

function normalizedAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return trimmed === '' ? null : trimmed;
}

export type BookkeepingController = ReturnType<typeof useBookkeepingController>;
