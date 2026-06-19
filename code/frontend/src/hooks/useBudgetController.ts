import { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import {
  createBudget,
  deleteBudget,
  getBudgetDetail,
  listBudgets,
  updateBudget,
} from '../api/budgets';
import type { AuthSession } from '../types/auth';
import type {
  BudgetDetail,
  BudgetStatus,
  BudgetSummary,
  CurrencyCode,
} from '../types/budget';
import type { BudgetFormValues } from '../types/forms';
import { translateCurrent } from '../i18n';
import {
  clearSelectedBudgetIdForWorkspace,
  rememberSelectedBudgetId,
  selectedBudgetIdForWorkspace,
} from './budgetControllerStorage';
import {
  budgetFormValuesFromSummary,
  createPayloadFromForm,
  defaultBudgetFormValues,
  signaturePayloadFromForm,
  statusUpdatePayload,
  updatePayloadFromBudget,
  updatePayloadFromForm,
} from './budgetControllerPayload';

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
  const [currentBudgetId, setCurrentBudgetId] = useState<number | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isBudgetLoading, setIsBudgetLoading] = useState(false);
  const [isBudgetDetailLoading, setIsBudgetDetailLoading] = useState(false);
  const [isBudgetSaving, setIsBudgetSaving] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<number | null>(null);
  const requestedBudgetId = useRef<number | null>(options.initialBudgetId ?? null);
  const requestedBudgetWorkspaceId = useRef<number | null>(null);
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
        setCurrentBudgetId(null);
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

        const scopedRequestedBudgetId =
          requestedBudgetWorkspaceId.current === null ||
          requestedBudgetWorkspaceId.current === workspaceId
            ? requestedBudgetId.current
            : null;
        const storedBudgetId = selectedBudgetIdForWorkspace(workspaceId);
        const availableStoredBudgetId =
          storedBudgetId !== null && nextBudgets.some((budget) => budget.id === storedBudgetId)
            ? storedBudgetId
            : null;
        setCurrentBudgetId(availableStoredBudgetId);

        const budgetIdToOpen = scopedRequestedBudgetId ?? availableStoredBudgetId;
        if (budgetIdToOpen === null) {
          clearSelectedBudgetIdForWorkspace(workspaceId);
          return;
        }

        setIsBudgetDetailLoading(true);
        try {
          const budgetDetail = await getBudgetDetail(budgetIdToOpen);
          if (isMounted) {
            setSelectedBudget(budgetDetail);
            requestedBudgetId.current = budgetDetail.id;
            requestedBudgetWorkspaceId.current = workspaceId;
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
    budgetForm.resetFields();
    budgetForm.setFieldsValue(defaultBudgetFormValues(activeWorkspaceId, baseCurrency, session));
    setEditingBudgetId(null);
    setIsBudgetModalOpen(true);
  };

  const openBudgetEditModal = (budget: BudgetSummary) => {
    setBudgetError(null);
    setEditingBudgetId(budget.id);
    budgetForm.resetFields();
    budgetForm.setFieldsValue(budgetFormValuesFromSummary(budget, selectedBudget, session));
    setIsBudgetModalOpen(true);
  };

  const openBudgetSignatureModal = (budget: BudgetSummary) => {
    setBudgetError(null);
    setEditingBudgetId(budget.id);
    budgetForm.resetFields();
    budgetForm.setFieldsValue(budgetFormValuesFromSummary(budget, selectedBudget, session));
    setIsSignatureModalOpen(true);
  };

  const openBudgetInstallmentModal = (budget: BudgetSummary) => {
    setBudgetError(null);
    setEditingBudgetId(budget.id);
    budgetForm.resetFields();
    budgetForm.setFieldsValue(budgetFormValuesFromSummary(budget, selectedBudget, session));
    setIsInstallmentModalOpen(true);
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
      const isCreatingBudget = editingBudgetId === null;
      const savedBudget =
        editingBudgetId === null
          ? await createBudget(createPayloadFromForm(values))
          : await updateBudget(updatePayloadFromForm(editingBudgetId, values));

      requestedBudgetId.current = savedBudget.id;
      requestedBudgetWorkspaceId.current = workspaceId;
      if (editingBudgetId === null && workspaceId !== activeWorkspaceId) {
        await options.onWorkspaceSelected?.(workspaceId);
      }
      setBudgets((currentBudgets) => [
        savedBudget,
        ...currentBudgets.filter((budget) => budget.id !== savedBudget.id),
      ]);
      setSelectedBudget(savedBudget);
      setIsBudgetModalOpen(false);
      setIsSignatureModalOpen(false);
      setEditingBudgetId(null);
      budgetForm.resetFields();
      if (isCreatingBudget) {
        options.onCreated?.();
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setBudgetError(error.message);
      }
    } finally {
      setIsBudgetSaving(false);
    }
  };

  const handleBudgetSignatureSave = async () => {
    if (selectedBudget === null || editingBudgetId === null) {
      setBudgetError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await budgetForm.validateFields([['signatureConfig']]);
      setIsBudgetSaving(true);
      setBudgetError(null);
      const savedBudget = await updateBudget(updatePayloadFromBudget(selectedBudget, {
        signatureConfig: signaturePayloadFromForm(values),
      }));

      requestedBudgetId.current = savedBudget.id;
      requestedBudgetWorkspaceId.current = savedBudget.workspaceId;
      setSelectedBudget(savedBudget);
      setBudgets((currentBudgets) =>
        currentBudgets.map((budget) =>
          budget.id === savedBudget.id ? savedBudget : budget,
        ),
      );
      setIsSignatureModalOpen(false);
      setEditingBudgetId(null);
      budgetForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setBudgetError(error.message);
      }
    } finally {
      setIsBudgetSaving(false);
    }
  };

  const handleBudgetInstallmentSave = async () => {
    if (selectedBudget === null || editingBudgetId === null) {
      setBudgetError(translateCurrent('selectBudgetFirst'));

      return;
    }

    try {
      const values = await budgetForm.validateFields([
        'budgetType',
        'installmentDisplayMode',
        'installmentPeriodUnit',
      ]);
      setIsBudgetSaving(true);
      setBudgetError(null);
      const savedBudget = await updateBudget(updatePayloadFromBudget(selectedBudget, {
        budgetType: values.budgetType ?? 'regular',
        installmentDisplayMode: values.installmentDisplayMode ?? 'item',
        installmentPeriodUnit: values.installmentPeriodUnit ?? 'month',
      }));

      requestedBudgetId.current = savedBudget.id;
      requestedBudgetWorkspaceId.current = savedBudget.workspaceId;
      setSelectedBudget(savedBudget);
      setBudgets((currentBudgets) =>
        currentBudgets.map((budget) =>
          budget.id === savedBudget.id ? savedBudget : budget,
        ),
      );
      setIsInstallmentModalOpen(false);
      setEditingBudgetId(null);
      budgetForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setBudgetError(error.message);
      }
    } finally {
      setIsBudgetSaving(false);
    }
  };

  const handleBudgetHeaderSave = async (values: { title?: string; ownerName?: string }) => {
    if (selectedBudget === null) {
      return;
    }

    const nextTitle = values.title?.trim() ?? selectedBudget.title;
    const nextOwnerName = values.ownerName?.trim() ?? selectedBudget.ownerName;
    if (nextTitle === '') {
      setBudgetError(translateCurrent('budgetTitleRequired'));

      return;
    }

    if (nextTitle === selectedBudget.title && nextOwnerName === selectedBudget.ownerName) {
      return;
    }

    setIsBudgetSaving(true);
    setBudgetError(null);

    try {
      const savedBudget = await updateBudget(updatePayloadFromBudget(selectedBudget, {
        title: nextTitle,
        ownerName: nextOwnerName,
      }));
      requestedBudgetId.current = savedBudget.id;
      requestedBudgetWorkspaceId.current = savedBudget.workspaceId;
      setSelectedBudget(savedBudget);
      setBudgets((currentBudgets) =>
        currentBudgets.map((budget) =>
          budget.id === savedBudget.id ? savedBudget : budget,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        setBudgetError(error.message);
      }
    } finally {
      setIsBudgetSaving(false);
    }
  };

  const handleBudgetStatusChange = async (
    budgetSummary: BudgetSummary,
    nextStatus: BudgetStatus,
  ) => {
    if (budgetSummary.status === nextStatus) {
      return;
    }

    const sourceBudget =
      selectedBudget?.id === budgetSummary.id ? selectedBudget : budgetSummary;

    setIsBudgetSaving(true);
    setBudgetError(null);

    try {
      const savedBudget = await updateBudget(statusUpdatePayload(sourceBudget, nextStatus));
      requestedBudgetId.current = savedBudget.id;
      requestedBudgetWorkspaceId.current = savedBudget.workspaceId;
      if (selectedBudget?.id === savedBudget.id) {
        setSelectedBudget(savedBudget);
      }
      setBudgets((currentBudgets) =>
        currentBudgets.map((budget) =>
          budget.id === savedBudget.id ? savedBudget : budget,
        ),
      );
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
        requestedBudgetId.current = null;
        requestedBudgetWorkspaceId.current = activeWorkspaceId;
      } else if (requestedBudgetId.current === budgetId) {
        requestedBudgetId.current = null;
      }

      if (currentBudgetId === budgetId) {
        setCurrentBudgetId(null);
        if (activeWorkspaceId !== null) {
          clearSelectedBudgetIdForWorkspace(activeWorkspaceId);
        }
      }
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setDeletingBudgetId(null);
    }
  };

  const handleBudgetSelect = async (budgetId: number) => {
    requestedBudgetId.current = budgetId;
    requestedBudgetWorkspaceId.current = activeWorkspaceId;
    if (selectedBudget?.id === budgetId) {
      if (activeWorkspaceId !== null) {
        rememberSelectedBudgetId(activeWorkspaceId, budgetId);
        setCurrentBudgetId(budgetId);
      }

      return;
    }

    setIsBudgetDetailLoading(true);
    setBudgetError(null);

    try {
      const budgetDetail = await getBudgetDetail(budgetId);
      setSelectedBudget(budgetDetail);
      requestedBudgetWorkspaceId.current = budgetDetail.workspaceId;
      rememberSelectedBudgetId(budgetDetail.workspaceId, budgetDetail.id);
      setCurrentBudgetId(budgetDetail.id);
    } catch (error: unknown) {
      setBudgetError(error instanceof Error ? error.message : translateCurrent('loadingBudget'));
    } finally {
      setIsBudgetDetailLoading(false);
    }
  };

  const replaceBudgetDetail = (budgetDetail: BudgetDetail) => {
    setSelectedBudget(budgetDetail);
    requestedBudgetId.current = budgetDetail.id;
    requestedBudgetWorkspaceId.current = budgetDetail.workspaceId;
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
    currentBudgetId,
    budgetError,
    isBudgetModalOpen,
    setIsBudgetModalOpen,
    isInstallmentModalOpen,
    setIsInstallmentModalOpen,
    isSignatureModalOpen,
    setIsSignatureModalOpen,
    isBudgetLoading,
    isBudgetDetailLoading,
    isBudgetSaving,
    editingBudgetId,
    deletingBudgetId,
    openBudgetModal,
    openBudgetEditModal,
    openBudgetInstallmentModal,
    openBudgetSignatureModal,
    handleBudgetHeaderSave,
    handleBudgetInstallmentSave,
    handleBudgetStatusChange,
    handleBudgetSave,
    handleBudgetSignatureSave,
    handleBudgetSelect,
    handleBudgetDelete,
    replaceBudgetDetail,
  };
}

export type BudgetController = ReturnType<typeof useBudgetController>;
