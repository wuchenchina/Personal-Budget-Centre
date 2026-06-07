import { useEffect, useRef, useState } from 'react';
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
import { translateCurrent } from '../i18n';
import { defaultBudgetDateRange, defaultBudgetTitle } from '../utils/budgetTitle';

interface UseBudgetControllerOptions {
  activeWorkspaceId: number | null;
  baseCurrency: CurrencyCode;
  initialBudgetId?: number | null;
  session: AuthSession | null;
  onCreated?: () => void;
  onWorkspaceSelected?: (workspaceId: number) => Promise<void> | void;
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
  const requestedBudgetId = useRef<number | null>(options.initialBudgetId ?? null);
  const { activeWorkspaceId, baseCurrency, session } = options;

  useEffect(() => {
    let isMounted = true;

    if (activeWorkspaceId === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setBudgets([]);
        setSelectedBudget(null);
        setBudgetError(null);
        setIsBudgetLoading(false);
        setIsBudgetDetailLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    const workspaceId = activeWorkspaceId;

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

        const firstBudgetId = nextBudgets[0]?.id ?? null;
        const budgetIdToOpen = requestedBudgetId.current ?? firstBudgetId;
        if (budgetIdToOpen === null) {
          return;
        }

        setIsBudgetDetailLoading(true);
        try {
          const budgetDetail = await getBudgetDetail(budgetIdToOpen);
          if (isMounted) {
            setSelectedBudget(budgetDetail);
            setBudgets((currentBudgets) => {
              const hasBudget = currentBudgets.some((budget) => budget.id === budgetDetail.id);

              return hasBudget ? currentBudgets : [budgetDetail, ...currentBudgets];
            });
          }
        } catch (error: unknown) {
          if (isMounted) {
            setBudgetError(error instanceof Error ? error.message : translateCurrent('loadingBudget'));
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
          setBudgetError(
            error instanceof Error ? error.message : translateCurrent('loadingBudgetProjects'),
          );
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
    const dateRange = defaultBudgetDateRange();
    budgetForm.resetFields();
    budgetForm.setFieldsValue({
      workspaceId: activeWorkspaceId ?? undefined,
      title: defaultBudgetTitle(dateRange),
      ownerName: session?.user.displayName ?? '',
      ownerNameHidden: false,
      dateRange,
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
      workspaceId: budget.workspaceId,
      title: budget.title,
      ownerName: budget.ownerName,
      ownerNameHidden: budget.ownerName.trim() === '',
      dateRange:
        budget.startDate && budget.endDate
          ? [dayjs(budget.startDate), dayjs(budget.endDate)]
          : null,
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
      setBudgetError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    try {
      const values = await budgetForm.validateFields();
      setIsBudgetSaving(true);
      setBudgetError(null);

      const workspaceId = editingBudgetId === null ? values.workspaceId : activeWorkspaceId;
      const payload = {
        workspaceId,
        title: values.title.trim(),
        ownerName: values.ownerNameHidden ? '' : (values.ownerName?.trim() ?? ''),
        startDate: values.dateRange?.[0]?.format('YYYY-MM-DD') ?? null,
        endDate: values.dateRange?.[1]?.format('YYYY-MM-DD') ?? null,
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
              title: payload.title,
              ownerName: payload.ownerName,
              startDate: payload.startDate,
              endDate: payload.endDate,
              baseCurrency: payload.baseCurrency,
              displayCurrency: payload.displayCurrency,
              visibility: payload.visibility,
              status: payload.status,
              note: payload.note,
              id: editingBudgetId,
            });

      requestedBudgetId.current = savedBudget.id;
      if (editingBudgetId === null && workspaceId !== activeWorkspaceId) {
        await options.onWorkspaceSelected?.(workspaceId);
      }
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
        requestedBudgetId.current = nextBudget?.id ?? null;
        if (nextBudget !== undefined) {
          await handleBudgetSelect(nextBudget.id);
        }
      } else if (requestedBudgetId.current === budgetId) {
        requestedBudgetId.current = null;
      }
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setDeletingBudgetId(null);
    }
  };

  const handleBudgetSelect = async (budgetId: number) => {
    requestedBudgetId.current = budgetId;
    if (selectedBudget?.id === budgetId) {
      return;
    }

    setIsBudgetDetailLoading(true);
    setBudgetError(null);

    try {
      const budgetDetail = await getBudgetDetail(budgetId);
      setSelectedBudget(budgetDetail);
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : translateCurrent('loadingBudget'));
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
