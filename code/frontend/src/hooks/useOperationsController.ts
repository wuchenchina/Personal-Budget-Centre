import { useEffect, useMemo, useState } from 'react';
import {
  createBudgetCategory,
  createCategoryAlias,
  deleteBudgetCategory,
  deleteCategoryAlias,
  listBudgetCategories,
  updateBudgetCategory,
} from '../api/budgetCategories';
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
  Currency,
  CurrencyCode,
} from '../types/budget';
import { createPasskeyCredential } from '../utils/webauthn';

interface UseOperationsControllerOptions {
  activeWorkspaceId: number | null;
  selectedBudget: BudgetDetail | null;
  session: AuthSession | null;
}

export function useOperationsController(options: UseOperationsControllerOptions) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [reconciliation, setReconciliation] = useState<BudgetReconciliationRow[]>([]);
  const [exports, setExports] = useState<BudgetExport[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [creatingExportFormat, setCreatingExportFormat] = useState<BudgetExportFormat | null>(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegistering, setIsPasskeyRegistering] = useState(false);
  const { activeWorkspaceId, selectedBudget, session } = options;

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
          setOperationsError(error instanceof Error ? error.message : 'Failed to load currencies.');
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
          setOperationsError(error instanceof Error ? error.message : 'Failed to load passkeys.');
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
          setOperationsError(error instanceof Error ? error.message : 'Failed to load categories.');
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

      return;
    }

    let isMounted = true;
    setIsReconciliationLoading(true);
    setIsExportLoading(true);

    getBudgetReconciliation(selectedBudget.id)
      .then((rows) => {
        if (isMounted) {
          setReconciliation(rows);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setOperationsError(
            error instanceof Error ? error.message : 'Failed to load reconciliation.',
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
          setOperationsError(error instanceof Error ? error.message : 'Failed to load exports.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsExportLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBudget]);

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
      setOperationsError('Workspace is required before saving categories.');

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
      setOperationsError(error instanceof Error ? error.message : 'Failed to save category.');
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
      setOperationsError(error instanceof Error ? error.message : 'Failed to delete category.');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const saveAlias = async (categoryId: number, alias: string) => {
    if (activeWorkspaceId === null) {
      setOperationsError('Workspace is required before saving aliases.');

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
      setOperationsError(error instanceof Error ? error.message : 'Failed to save alias.');
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
      setOperationsError(error instanceof Error ? error.message : 'Failed to delete alias.');
    } finally {
      setIsCategorySaving(false);
    }
  };

  const createExport = async (format: BudgetExportFormat) => {
    if (selectedBudget === null) {
      setOperationsError('Select a budget before exporting.');

      return;
    }

    setCreatingExportFormat(format);
    setOperationsError(null);

    try {
      const nextExport = await createBudgetExport(selectedBudget.id, format);
      setExports((currentExports) => [nextExport, ...currentExports]);
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : 'Failed to create export.');
    } finally {
      setCreatingExportFormat(null);
    }
  };

  const downloadExport = (item: BudgetExport) => {
    window.open(exportDownloadUrl(item), '_blank', 'noopener,noreferrer');
  };

  const registerPasskey = async (deviceName?: string) => {
    setIsPasskeyRegistering(true);
    setOperationsError(null);

    try {
      const options = await getPasskeyRegistrationOptions();
      const credential = await createPasskeyCredential(options);
      setPasskeys(await verifyPasskeyRegistration(credential, deviceName));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : 'Failed to register passkey.');
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
      setOperationsError(error instanceof Error ? error.message : 'Failed to update passkey.');
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
      setOperationsError(error instanceof Error ? error.message : 'Failed to delete passkey.');
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
    passkeys,
    operationsError,
    isReferenceLoading,
    isCategorySaving,
    isReconciliationLoading,
    isExportLoading,
    creatingExportFormat,
    isPasskeyLoading,
    isPasskeyRegistering,
    saveCategory,
    removeCategory,
    saveAlias,
    removeAlias,
    createExport,
    downloadExport,
    registerPasskey,
    renamePasskey,
    removePasskey,
  };
}

export type OperationsController = ReturnType<typeof useOperationsController>;
