import { useEffect, useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
  createBudget,
  deleteBudget,
  getBudgetDetail,
  listBudgets,
  updateBudget,
} from '../api/budgets';
import type { AuthSession } from '../types/auth';
import type { BudgetDetail, BudgetSummary, CurrencyCode } from '../types/budget';
import type { BudgetFormValues } from '../types/forms';

interface UseBudgetControllerOptions {
  activeWorkspaceId: number | null;
  baseCurrency: CurrencyCode;
  session: AuthSession | null;
  onCreated?: () => void;
}

export function useBudgetController(options: UseBudgetControllerOptions) {
  const [budgetForm] = Form.useForm<BudgetFormValues>();
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetDetail | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);
  const [isBudgetDetailLoading, setIsBudgetDetailLoading] = useState(false);
  const [isBudgetSaving, setIsBudgetSaving] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<number | null>(null);
  const { activeWorkspaceId, baseCurrency, session } = options;

  useEffect(() => {
    if (activeWorkspaceId === null) {
      setBudgets([]);
      setSelectedBudget(null);
      setBudgetError(null);
      setIsBudgetLoading(false);
      setIsBudgetDetailLoading(false);

      return;
    }

    const workspaceId = activeWorkspaceId;
    let isMounted = true;

    async function loadWorkspaceBudgets() {
      setIsBudgetLoading(true);
      setIsBudgetDetailLoading(false);
      setSelectedBudget(null);

      try {
        const nextBudgets = await listBudgets(workspaceId);
        if (!isMounted) {
          return;
        }

        setBudgets(nextBudgets);
        setBudgetError(null);

        const firstBudget = nextBudgets[0];
        if (firstBudget === undefined) {
          return;
        }

        setIsBudgetDetailLoading(true);
        try {
          const budgetDetail = await getBudgetDetail(firstBudget.id);
          if (isMounted) {
            setSelectedBudget(budgetDetail);
          }
        } catch (error: unknown) {
          if (isMounted) {
            setBudgetError(error instanceof Error ? error.message : 'Failed to load budget.');
          }
        } finally {
          if (isMounted) {
            setIsBudgetDetailLoading(false);
          }
        }
      } catch (error: unknown) {
        if (isMounted) {
          setBudgets([]);
          setSelectedBudget(null);
          setBudgetError(error instanceof Error ? error.message : 'Failed to load budgets.');
        }
      } finally {
        if (isMounted) {
          setIsBudgetLoading(false);
        }
      }
    }

    void loadWorkspaceBudgets();

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  const openBudgetModal = () => {
    setBudgetError(null);
    budgetForm.resetFields();
    const periodStart = dayjs().startOf('month');
    const periodEnd = dayjs().endOf('month');
    budgetForm.setFieldsValue({
      title: `Personal Budget ${periodStart.format('YYYY-MM')}`,
      ownerName: session?.user.displayName ?? '',
      dateRange: [periodStart, periodEnd],
      baseCurrency,
      displayCurrency: baseCurrency,
      visibility: 'private',
      status: 'draft',
    });
    setEditingBudgetId(null);
    setIsBudgetModalOpen(true);
  };

  const openBudgetEditModal = (budget: BudgetSummary) => {
    setBudgetError(null);
    setEditingBudgetId(budget.id);
    budgetForm.resetFields();
    budgetForm.setFieldsValue({
      title: budget.title,
      ownerName: budget.ownerName,
      dateRange: [dayjs(budget.startDate), dayjs(budget.endDate)],
      baseCurrency: budget.baseCurrency,
      displayCurrency: budget.displayCurrency,
      visibility: budget.visibility,
      status: budget.status,
      note: budget.note ?? undefined,
    });
    setIsBudgetModalOpen(true);
  };

  const handleBudgetSave = async () => {
    if (activeWorkspaceId === null) {
      setBudgetError('Workspace is required before creating budgets.');

      return;
    }

    try {
      const values = await budgetForm.validateFields();
      setIsBudgetSaving(true);
      setBudgetError(null);

      const payload = {
        workspaceId: activeWorkspaceId,
        title: values.title.trim(),
        ownerName: values.ownerName.trim(),
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        baseCurrency: values.baseCurrency,
        displayCurrency: values.displayCurrency,
        visibility: values.visibility,
        status: values.status,
        note: values.note?.trim() || null,
      };
      const savedBudget =
        editingBudgetId === null
          ? await createBudget(payload)
          : await updateBudget({
              ...payload,
              id: editingBudgetId,
            });

      setBudgets((currentBudgets) => [
        savedBudget,
        ...currentBudgets.filter((budget) => budget.id !== savedBudget.id),
      ]);
      setSelectedBudget(savedBudget);
      setIsBudgetModalOpen(false);
      setEditingBudgetId(null);
      budgetForm.resetFields();
      options.onCreated?.();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setBudgetError(error.message);
      }
    } finally {
      setIsBudgetSaving(false);
    }
  };

  const handleBudgetDelete = async (budgetId: number) => {
    setDeletingBudgetId(budgetId);
    setBudgetError(null);

    try {
      await deleteBudget(budgetId);
      const remainingBudgets = budgets.filter((budget) => budget.id !== budgetId);
      setBudgets(remainingBudgets);

      if (selectedBudget?.id === budgetId) {
        setSelectedBudget(null);
        const nextBudget = remainingBudgets[0];
        if (nextBudget !== undefined) {
          await handleBudgetSelect(nextBudget.id);
        }
      }
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : 'Failed to delete budget.');
    } finally {
      setDeletingBudgetId(null);
    }
  };

  const handleBudgetSelect = async (budgetId: number) => {
    if (selectedBudget?.id === budgetId) {
      return;
    }

    setIsBudgetDetailLoading(true);
    setBudgetError(null);

    try {
      const budgetDetail = await getBudgetDetail(budgetId);
      setSelectedBudget(budgetDetail);
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : 'Failed to load budget.');
    } finally {
      setIsBudgetDetailLoading(false);
    }
  };

  const replaceBudgetDetail = (budgetDetail: BudgetDetail) => {
    setSelectedBudget(budgetDetail);
    setBudgets((currentBudgets) => {
      const hasBudget = currentBudgets.some((budget) => budget.id === budgetDetail.id);

      if (!hasBudget) {
        return [budgetDetail, ...currentBudgets];
      }

      return currentBudgets.map((budget) =>
        budget.id === budgetDetail.id ? budgetDetail : budget,
      );
    });
  };

  return {
    budgetForm,
    budgets,
    selectedBudget,
    budgetError,
    isBudgetModalOpen,
    setIsBudgetModalOpen,
    isBudgetLoading,
    isBudgetDetailLoading,
    isBudgetSaving,
    editingBudgetId,
    deletingBudgetId,
    openBudgetModal,
    openBudgetEditModal,
    handleBudgetSave,
    handleBudgetSelect,
    handleBudgetDelete,
    replaceBudgetDetail,
  };
}

export type BudgetController = ReturnType<typeof useBudgetController>;
