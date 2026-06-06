import { useEffect, useMemo, useState } from 'react';
import {
  createBudgetCategory,
  createCategoryAlias,
  deleteBudgetCategory,
  deleteCategoryAlias,
  listBudgetCategories,
  updateBudgetCategory,
} from '../api/budgetCategories';
import {
  createBudgetShare,
  deleteBudgetShare,
  listBudgetShares,
  updateBudgetShare,
} from '../api/budgetShares';
import { createBudgetExport, exportDownloadUrl, listBudgetExports } from '../api/exports';
import {
  deletePasskeyCredential,
  getPasskeyRegistrationOptions,
  listPasskeyCredentials,
  updatePasskeyCredential,
  verifyPasskeyRegistration,
} from '../api/passkeys';
import { getBudgetReconciliation } from '../api/reconciliation';
import { listCurrencies } from '../api/referenceData';
import type { AuthSession, PasskeyCredential } from '../types/auth';
import type {
  BudgetCategory,
  BudgetDetail,
  BudgetExport,
  BudgetExportFormat,
  BudgetReconciliationRow,
  BudgetShare,
  BudgetSharePrincipalType,
  BudgetShareRole,
  Currency,
  CurrencyCode,
} from '../types/budget';
import { createPasskeyCredential } from '../utils/webauthn';

interface UseOperationsControllerOptions {
  activeWorkspaceId: number | null;
  selectedBudget: BudgetDetail | null;
  session: AuthSession | null;
  canManageBudgetShares: boolean;
}

export function useOperationsController(options: UseOperationsControllerOptions) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [reconciliation, setReconciliation] = useState<BudgetReconciliationRow[]>([]);
  const [exports, setExports] = useState<BudgetExport[]>([]);
  const [shares, setShares] = useState<BudgetShare[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isShareSaving, setIsShareSaving] = useState(false);
  const [creatingExportFormat, setCreatingExportFormat] = useState<BudgetExportFormat | null>(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegistering, setIsPasskeyRegistering] = useState(false);
  const { activeWorkspaceId, canManageBudgetShares, selectedBudget, session } = options;

  useEffect(() => {
    if (session === null) {
      setCurrencies([]);
      setPasskeys([]);
      setOperationsError(null);
      setIsReferenceLoading(false);
      setIsPasskeyLoading(false);

      return;
    }

    let isMounted = true;
    setIsReferenceLoading(true);
    setIsPasskeyLoading(true);

    listCurrencies()
      .then((nextCurrencies) => {
        if (isMounted) {
          setCurrencies(nextCurrencies);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(error instanceof Error ? error.message : '加载货币失败。');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReferenceLoading(false);
        }
      });

    listPasskeyCredentials()
      .then((nextPasskeys) => {
        if (isMounted) {
          setPasskeys(nextPasskeys);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(error instanceof Error ? error.message : '加载通行密钥失败。');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsPasskeyLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (activeWorkspaceId === null) {
      setCategories([]);

      return;
    }

    let isMounted = true;
    setIsReferenceLoading(true);

    listBudgetCategories(activeWorkspaceId)
      .then((nextCategories) => {
        if (isMounted) {
          setCategories(nextCategories);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(error instanceof Error ? error.message : '加载分类失败。');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReferenceLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (selectedBudget === null) {
      setReconciliation([]);
      setExports([]);
      setShares([]);

      return;
    }

    let isMounted = true;
    setIsReconciliationLoading(true);
    setIsExportLoading(true);
    setIsShareLoading(canManageBudgetShares);

    getBudgetReconciliation(selectedBudget.id)
      .then((rows) => {
        if (isMounted) {
          setReconciliation(rows);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(
            error instanceof Error ? error.message : '加载对账结果失败。',
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReconciliationLoading(false);
        }
      });

    listBudgetExports(selectedBudget.id)
      .then((items) => {
        if (isMounted) {
          setExports(items);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(error instanceof Error ? error.message : '加载导出记录失败。');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsExportLoading(false);
        }
      });

    if (canManageBudgetShares) {
      listBudgetShares(selectedBudget.id)
        .then((items) => {
          if (isMounted) {
            setShares(items);
          }
        })
        .catch((error: unknown) => {
          if (isMounted) {
            setOperationsError(error instanceof Error ? error.message : '加载共享规则失败。');
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsShareLoading(false);
          }
        });
    } else {
      setShares([]);
      setIsShareLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [canManageBudgetShares, selectedBudget]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.isActive)
        .map((category) => ({
          label: category.name,
          value: category.id,
        })),
    [categories],
  );

  const currencyOptions = useMemo(
    () =>
      currencies.map((currency) => ({
        label: `${currency.code} ${currency.name}`,
        value: currency.code,
      })),
    [currencies],
  );

  const saveCategory = async (input: {
    id?: number;
    name: string;
    defaultCurrency?: CurrencyCode | null;
  }) => {
    if (activeWorkspaceId === null) {
      setOperationsError('请先选择工作区，再保存分类。');

      return;
    }

    setIsCategorySaving(true);
    setOperationsError(null);

    try {
      const payload = {
        name: input.name.trim(),
        defaultCurrency: input.defaultCurrency ?? null,
      };
      const nextCategories =
        input.id === undefined
          ? await createBudgetCategory({ ...payload, workspaceId: activeWorkspaceId })
          : await updateBudgetCategory({ ...payload, id: input.id, isActive: true });

      setCategories(nextCategories);
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '保存分类失败。');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const removeCategory = async (id: number) => {
    setIsCategorySaving(true);
    setOperationsError(null);

    try {
      setCategories(await deleteBudgetCategory(id));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '删除分类失败。');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const saveAlias = async (categoryId: number, alias: string) => {
    if (activeWorkspaceId === null) {
      setOperationsError('请先选择工作区，再保存别名。');

      return;
    }

    setIsCategorySaving(true);
    setOperationsError(null);

    try {
      setCategories(
        await createCategoryAlias({
          workspaceId: activeWorkspaceId,
          categoryId,
          alias: alias.trim(),
        }),
      );
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '保存别名失败。');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const removeAlias = async (id: number) => {
    setIsCategorySaving(true);
    setOperationsError(null);

    try {
      setCategories(await deleteCategoryAlias(id));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '删除别名失败。');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const createExport = async (format: BudgetExportFormat) => {
    if (selectedBudget === null) {
      setOperationsError('请先选择预算，再导出。');

      return;
    }

    setCreatingExportFormat(format);
    setOperationsError(null);

    try {
      const nextExport = await createBudgetExport(selectedBudget.id, format);
      setExports((currentExports) => [nextExport, ...currentExports]);
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '创建导出失败。');
    } finally {
      setCreatingExportFormat(null);
    }
  };

  const downloadExport = (item: BudgetExport) => {
    window.open(exportDownloadUrl(item), '_blank', 'noopener,noreferrer');
  };

  const saveShare = async (input: {
    id?: number;
    principalType?: BudgetSharePrincipalType;
    principalId?: number;
    role: BudgetShareRole;
    canExport: boolean;
    canReshare: boolean;
    expiresAt?: string | null;
  }) => {
    if (selectedBudget === null) {
      setOperationsError('请先选择预算，再管理共享。');

      return;
    }

    setIsShareSaving(true);
    setOperationsError(null);

    try {
      const nextShares =
        input.id === undefined
          ? await createBudgetShare({
              budgetId: selectedBudget.id,
              principalType: input.principalType ?? 'user',
              principalId: input.principalId ?? 0,
              role: input.role,
              canExport: input.canExport,
              canReshare: input.canReshare,
              expiresAt: input.expiresAt ?? null,
            })
          : await updateBudgetShare({
              id: input.id,
              role: input.role,
              canExport: input.canExport,
              canReshare: input.canReshare,
              expiresAt: input.expiresAt ?? null,
            });
      setShares(nextShares);
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '保存共享规则失败。');
    } finally {
      setIsShareSaving(false);
    }
  };

  const removeShare = async (id: number) => {
    setIsShareSaving(true);
    setOperationsError(null);

    try {
      setShares(await deleteBudgetShare(id));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '删除共享规则失败。');
    } finally {
      setIsShareSaving(false);
    }
  };

  const registerPasskey = async (deviceName?: string) => {
    setIsPasskeyRegistering(true);
    setOperationsError(null);

    try {
      const options = await getPasskeyRegistrationOptions();
      const credential = await createPasskeyCredential(options);
      setPasskeys(await verifyPasskeyRegistration(credential, deviceName));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '注册通行密钥失败。');
    } finally {
      setIsPasskeyRegistering(false);
    }
  };

  const renamePasskey = async (id: number, deviceName: string | null) => {
    setIsPasskeyLoading(true);
    setOperationsError(null);

    try {
      setPasskeys(await updatePasskeyCredential(id, deviceName));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '更新通行密钥失败。');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const removePasskey = async (id: number) => {
    setIsPasskeyLoading(true);
    setOperationsError(null);

    try {
      setPasskeys(await deletePasskeyCredential(id));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : '删除通行密钥失败。');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return {
    currencies,
    categories,
    categoryOptions,
    currencyOptions,
    reconciliation,
    exports,
    shares,
    passkeys,
    operationsError,
    isReferenceLoading,
    isCategorySaving,
    isReconciliationLoading,
    isExportLoading,
    isShareLoading,
    isShareSaving,
    creatingExportFormat,
    isPasskeyLoading,
    isPasskeyRegistering,
    saveCategory,
    removeCategory,
    saveAlias,
    removeAlias,
    createExport,
    downloadExport,
    saveShare,
    removeShare,
    registerPasskey,
    renamePasskey,
    removePasskey,
  };
}

export type OperationsController = ReturnType<typeof useOperationsController>;
