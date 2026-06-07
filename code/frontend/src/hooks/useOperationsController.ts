import { useEffect, useMemo, useState } from 'react';
import {
  createBudgetCategory,
  createCategoryAlias,
  deleteBudgetCategories,
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
import { createBudgetExport, exportDownloadUrl } from '../api/exports';
import { refreshBochkRates, refreshMastercardRates } from '../api/exchangeRates';
import {
  deletePasskeyCredential,
  getPasskeyRegistrationOptions,
  listPasskeyCredentials,
  updatePasskeyCredential,
  verifyPasskeyRegistration,
} from '../api/passkeys';
import { listCurrencies } from '../api/referenceData';
import type { AuthSession, PasskeyCredential } from '../types/auth';
import type {
  BudgetCategory,
  BudgetDetail,
  BudgetExportFormat,
  BudgetShare,
  BudgetSharePrincipalType,
  BudgetShareRole,
  Currency,
  CurrencyCode,
} from '../types/budget';
import { translateCurrent } from '../i18n';
import { createPasskeyCredential } from '../utils/webauthn';

interface UseOperationsControllerOptions {
  activeWorkspaceId: number | null;
  selectedBudget: BudgetDetail | null;
  session: AuthSession | null;
  canManageBudgetShares: boolean;
}

function triggerExportDownload(url: string): void {
  const link = document.createElement('a');

  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function useOperationsController(options: UseOperationsControllerOptions) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [shares, setShares] = useState<BudgetShare[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isShareSaving, setIsShareSaving] = useState(false);
  const [creatingExportFormat, setCreatingExportFormat] = useState<BudgetExportFormat | null>(null);
  const [refreshingExchangeRateSource, setRefreshingExchangeRateSource] = useState<
    'bochk' | 'mastercard' | null
  >(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegistering, setIsPasskeyRegistering] = useState(false);
  const { activeWorkspaceId, canManageBudgetShares, selectedBudget, session } = options;

  useEffect(() => {
    let isMounted = true;

    if (session === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCurrencies([]);
        setPasskeys([]);
        setOperationsError(null);
        setIsReferenceLoading(false);
        setIsPasskeyLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

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
            setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingCurrency'));
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
            setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingPasskeys'));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsPasskeyLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    if (activeWorkspaceId === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCategories([]);
        setIsCategoryLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setIsCategoryLoading(true);

      listBudgetCategories(activeWorkspaceId)
        .then((nextCategories) => {
          if (isMounted) {
            setCategories(nextCategories);
          }
        })
        .catch((error: unknown) => {
          if (isMounted) {
            setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingCategories'));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsCategoryLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    let isMounted = true;

    if (selectedBudget === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setShares([]);
        setIsShareLoading(false);
      });

      return () => {
        isMounted = false;
      };
    }

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setIsShareLoading(canManageBudgetShares);

      if (canManageBudgetShares) {
        listBudgetShares(selectedBudget.id)
          .then((items) => {
            if (isMounted) {
              setShares(items);
            }
          })
          .catch((error: unknown) => {
            if (isMounted) {
              setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingShares'));
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
    });

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
      setOperationsError(translateCurrent('selectWorkspaceFirst'));

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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('saveCategoryFailed'));
    } finally {
      setIsCategorySaving(false);
    }
  };

  const removeCategory = async (id: number) => {
    await removeCategories([id]);
  };

  const removeCategories = async (ids: number[]) => {
    if (ids.length === 0) {
      return;
    }

    setIsCategorySaving(true);
    setOperationsError(null);

    try {
      setCategories(ids.length === 1
        ? await deleteBudgetCategory(ids[0])
        : await deleteBudgetCategories(ids));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('saveCategoryFailed'));
    } finally {
      setIsCategorySaving(false);
    }
  };

  const saveAlias = async (categoryId: number, alias: string) => {
    if (activeWorkspaceId === null) {
      setOperationsError(translateCurrent('selectWorkspaceFirst'));

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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('saveAliasFailed'));
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('saveAliasFailed'));
    } finally {
      setIsCategorySaving(false);
    }
  };

  const createExport = async (format: BudgetExportFormat) => {
    if (selectedBudget === null) {
      setOperationsError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setCreatingExportFormat(format);
    setOperationsError(null);

    try {
      const nextExport = await createBudgetExport(selectedBudget.id, format);
      triggerExportDownload(exportDownloadUrl(nextExport));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setCreatingExportFormat(null);
    }
  };

  const refreshBochk = async () => {
    if (activeWorkspaceId === null) {
      setOperationsError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    setRefreshingExchangeRateSource('bochk');
    setOperationsError(null);

    try {
      await refreshBochkRates(activeWorkspaceId);
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setRefreshingExchangeRateSource(null);
    }
  };

  const refreshMastercard = async () => {
    if (activeWorkspaceId === null) {
      setOperationsError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    setRefreshingExchangeRateSource('mastercard');
    setOperationsError(null);

    try {
      await refreshMastercardRates({
        workspaceId: activeWorkspaceId,
        toCurrency: selectedBudget?.baseCurrency,
      });
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
    } finally {
      setRefreshingExchangeRateSource(null);
    }
  };

  const saveShare = async (input: {
    id?: number;
    principalType?: BudgetSharePrincipalType;
    principalId?: number;
    principalIdentifier?: string;
    role: BudgetShareRole;
    canExport: boolean;
    canReshare: boolean;
    expiresAt?: string | null;
  }) => {
    if (selectedBudget === null) {
      setOperationsError(translateCurrent('selectBudgetFirst'));

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
              principalId: input.principalId,
              principalIdentifier: input.principalIdentifier,
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return {
    currencies,
    categories,
    categoryOptions,
    currencyOptions,
    shares,
    passkeys,
    operationsError,
    isReferenceLoading,
    isCategoryLoading,
    isCategorySaving,
    isShareLoading,
    isShareSaving,
    creatingExportFormat,
    refreshingExchangeRateSource,
    isPasskeyLoading,
    isPasskeyRegistering,
    saveCategory,
    removeCategory,
    removeCategories,
    saveAlias,
    removeAlias,
    createExport,
    refreshBochk,
    refreshMastercard,
    saveShare,
    removeShare,
    registerPasskey,
    renamePasskey,
    removePasskey,
  };
}

export type OperationsController = ReturnType<typeof useOperationsController>;
