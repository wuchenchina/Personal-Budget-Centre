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
import type { BudgetDetail, BudgetStatus, BudgetSummary, CurrencyCode } from '../types/budget';
import type { BudgetFormValues } from '../types/forms';
import { currentLanguage, translateCurrent } from '../i18n';
import {
  createSignatureRow,
  emptySignatureConfig,
  signatureConfigFromForm,
  signatureConfigToForm,
  signatureTitleForLanguage,
} from '../utils/budgetSignature';
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
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
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
    const language = currentLanguage();
    budgetForm.resetFields();
    budgetForm.setFieldsValue({
      workspaceId: activeWorkspaceId ?? undefined,
      title: defaultBudgetTitle(dateRange),
      ownerName: session?.user.displayName ?? '',
      dateRange,
      baseCurrency,
      displayCurrency: baseCurrency,
      visibility: 'private',
      status: 'draft',
      signatureConfig: {
        ...emptySignatureConfig(),
        title: signatureTitleForLanguage(language),
        infoLanguage: language,
        labelLanguage: language,
        labelSeparator: language === 'en' ? 'space' : 'none',
        rows: [
          { ...createSignatureRow('manual'), roleLabel: translateCurrent('defaultSignatureRole') },
        ],
      },
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
      dateRange:
        budget.startDate && budget.endDate
          ? [dayjs(budget.startDate), dayjs(budget.endDate)]
          : null,
      baseCurrency: budget.baseCurrency,
      displayCurrency: budget.displayCurrency,
      visibility: budget.visibility,
      status: budget.status,
      note: budget.note ?? undefined,
      signatureConfig: signatureConfigToForm(budget.signatureConfig, currentLanguage()),
    });
    setIsBudgetModalOpen(true);
  };

  const openBudgetSignatureModal = (budget: BudgetSummary) => {
    setBudgetError(null);
    setEditingBudgetId(budget.id);
    budgetForm.resetFields();
    budgetForm.setFieldsValue({
      workspaceId: budget.workspaceId,
      title: budget.title,
      ownerName: budget.ownerName,
      dateRange:
        budget.startDate && budget.endDate
          ? [dayjs(budget.startDate), dayjs(budget.endDate)]
          : null,
      baseCurrency: budget.baseCurrency,
      displayCurrency: budget.displayCurrency,
      visibility: budget.visibility,
      status: budget.status,
      note: budget.note ?? undefined,
      signatureConfig: signatureConfigToForm(budget.signatureConfig, currentLanguage()),
    });
    setIsSignatureModalOpen(true);
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
      const signatureConfig = signatureConfigFromForm(values.signatureConfig);
      const payload = {
        workspaceId,
        title: values.title.trim(),
        ownerName: values.ownerName?.trim() ?? '',
        startDate: values.dateRange?.[0]?.format('YYYY-MM-DD') ?? null,
        endDate: values.dateRange?.[1]?.format('YYYY-MM-DD') ?? null,
        baseCurrency: values.baseCurrency,
        displayCurrency: values.displayCurrency,
        visibility: values.visibility,
        status: values.status ?? 'draft',
        note: values.note?.trim() || null,
        signatureConfig,
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
              signatureConfig: payload.signatureConfig,
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
      const savedBudget = await updateBudget({
        id: selectedBudget.id,
        title: selectedBudget.title,
        ownerName: selectedBudget.ownerName,
        startDate: selectedBudget.startDate,
        endDate: selectedBudget.endDate,
        baseCurrency: selectedBudget.baseCurrency,
        displayCurrency: selectedBudget.displayCurrency,
        visibility: selectedBudget.visibility,
        status: selectedBudget.status,
        note: selectedBudget.note,
        signatureConfig: signatureConfigFromForm(values.signatureConfig),
      });

      requestedBudgetId.current = savedBudget.id;
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
      const savedBudget = await updateBudget({
        id: selectedBudget.id,
        title: nextTitle,
        ownerName: nextOwnerName,
        startDate: selectedBudget.startDate,
        endDate: selectedBudget.endDate,
        baseCurrency: selectedBudget.baseCurrency,
        displayCurrency: selectedBudget.displayCurrency,
        visibility: selectedBudget.visibility,
        status: selectedBudget.status,
        note: selectedBudget.note,
        signatureConfig: selectedBudget.signatureConfig,
      });
      requestedBudgetId.current = savedBudget.id;
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
      const savedBudget = await updateBudget({
        id: sourceBudget.id,
        title: sourceBudget.title,
        ownerName: sourceBudget.ownerName,
        startDate: sourceBudget.startDate,
        endDate: sourceBudget.endDate,
        baseCurrency: sourceBudget.baseCurrency,
        displayCurrency: sourceBudget.displayCurrency,
        visibility: sourceBudget.visibility,
        status: nextStatus,
        note: sourceBudget.note,
        signatureConfig: sourceBudget.signatureConfig,
      });
      requestedBudgetId.current = savedBudget.id;
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
    isSignatureModalOpen,
    setIsSignatureModalOpen,
    isBudgetLoading,
    isBudgetDetailLoading,
    isBudgetSaving,
    editingBudgetId,
    deletingBudgetId,
    openBudgetModal,
    openBudgetEditModal,
    openBudgetSignatureModal,
    handleBudgetHeaderSave,
    handleBudgetStatusChange,
    handleBudgetSave,
    handleBudgetSignatureSave,
    handleBudgetSelect,
    handleBudgetDelete,
    replaceBudgetDetail,
  };
}

export type BudgetController = ReturnType<typeof useBudgetController>;
