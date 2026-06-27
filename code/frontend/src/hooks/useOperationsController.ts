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
import { createBudgetExport, exportDownloadUrl, getBudgetExportStatus } from '../api/exports';
import { refreshBankReferenceRates } from '../api/exchangeRates';
import {
  createCurrency,
  deleteCurrency,
  listCurrencies,
  listCurrencyPresets,
} from '../api/referenceData';
import type { AuthSession, PasskeyCredential } from '../types/auth';
import type {
  BudgetCategory,
  BudgetDetail,
  BudgetExport,
  BudgetExportFormat,
  BudgetExportOptions,
  BudgetShare,
  BudgetSharePrincipalType,
  BudgetShareRole,
  Currency,
  CurrencyCode,
} from '../types/budget';
import { translateCurrent } from '../i18n';
import { buildCurrencyOptions } from '../utils/currencyOptions';
import { normalizePdfExportSettings } from '../utils/pdfExportSettings';

interface UseOperationsControllerOptions {
  activeWorkspaceId: number | null;
  selectedBudget: BudgetDetail | null;
  session: AuthSession | null;
  canManageBudgetShares: boolean;
  loadPasskeys?: boolean;
}

function triggerExportDownload(url: string): void {
  const link = document.createElement('a');

  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function exportPollDelay(attempt: number): number {
  const quickPollDelays = [100, 200, 400, 800, 1000];

  return quickPollDelays[attempt] ?? 2000;
}

export function useOperationsController(options: UseOperationsControllerOptions) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyPresets, setCurrencyPresets] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [shares, setShares] = useState<BudgetShare[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [isReferenceLoading, setIsReferenceLoading] = useState(false);
  const [isCurrencySaving, setIsCurrencySaving] = useState(false);
  const [deletingCurrencyId, setDeletingCurrencyId] = useState<number | null>(null);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isShareSaving, setIsShareSaving] = useState(false);
  const [creatingExportFormat, setCreatingExportFormat] = useState<BudgetExportFormat | null>(null);
  const [activeExport, setActiveExport] = useState<BudgetExport | null>(null);
  const [refreshingExchangeRateSource, setRefreshingExchangeRateSource] = useState<'bank_reference' | null>(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isPasskeyRegistering, setIsPasskeyRegistering] = useState(false);
  const { activeWorkspaceId, canManageBudgetShares, loadPasskeys = false, selectedBudget, session } = options;

  useEffect(() => {
    let isMounted = true;

    if (session === null) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCurrencies([]);
        setCurrencyPresets([]);
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

      listCurrencies({
        workspaceId: activeWorkspaceId,
        budgetId: selectedBudget?.id ?? null,
      })
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

      listCurrencyPresets()
        .then((nextPresets) => {
          if (isMounted) {
            setCurrencyPresets(nextPresets);
          }
        })
        .catch(() => {
          if (isMounted) {
            setCurrencyPresets([]);
          }
        });

      if (!loadPasskeys) {
        setPasskeys([]);
        setIsPasskeyLoading(false);

        return;
      }

      setIsPasskeyLoading(true);
      void import('../api/passkeys')
        .then(({ listPasskeyCredentials }) => listPasskeyCredentials())
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
  }, [activeWorkspaceId, loadPasskeys, selectedBudget?.id, session]);

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
    () => buildCurrencyOptions(currencies),
    [currencies],
  );

  const currencyCatalogOptions = useMemo(
    () => {
      const catalogCurrencies = new Map<CurrencyCode, Currency>();

      currencyPresets.forEach((currency) => {
        catalogCurrencies.set(currency.code, currency);
      });
      currencies.forEach((currency) => {
        catalogCurrencies.set(currency.code, currency);
      });

      return buildCurrencyOptions(
        Array.from(catalogCurrencies.values())
          .sort((left, right) => left.code.localeCompare(right.code)),
      );
    },
    [currencies, currencyPresets],
  );

  const saveCurrency = async (input: {
    code: string;
    name: string;
    symbol?: string;
    decimalPlaces: number;
    source?: 'catalog' | 'manual';
  }): Promise<boolean> => {
    setIsCurrencySaving(true);
    setOperationsError(null);

    try {
      const created = await createCurrency({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        symbol: input.symbol?.trim() || undefined,
        decimalPlaces: input.decimalPlaces,
        source: input.source,
      });
      setCurrencies((current) =>
        [...current.filter((currency) => currency.id !== created.id), created]
          .sort((left, right) => left.code.localeCompare(right.code)),
      );
      return true;
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('saveCurrencyFailed'));
      return false;
    } finally {
      setIsCurrencySaving(false);
    }
  };

  const removeCurrency = async (id: number): Promise<boolean> => {
    setDeletingCurrencyId(id);
    setOperationsError(null);

    try {
      setCurrencies(await deleteCurrency(id));
      return true;
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('deleteCurrencyFailed'));
      return false;
    } finally {
      setDeletingCurrencyId(null);
    }
  };

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

  const createExport = async (format: BudgetExportFormat, exportOptions: BudgetExportOptions = {}) => {
    if (creatingExportFormat !== null) {
      return;
    }

    if (selectedBudget === null) {
      setOperationsError(translateCurrent('selectBudgetFirst'));

      return;
    }

    setCreatingExportFormat(format);
    setOperationsError(null);

    try {
      const userPdfExportSettings = normalizePdfExportSettings(session?.user.pdfExportSettings);
      const nextExport = await createBudgetExport(selectedBudget.id, format, {
        pdfTheme: session?.user.defaultPdfTheme ?? 'classic',
        showWorkspace: userPdfExportSettings.showWorkspace,
        pdfLanguages: userPdfExportSettings.pdfLanguages,
        signatureLabelMode: userPdfExportSettings.signatureLabelMode,
        signatureLabelLanguages: userPdfExportSettings.signatureLabelLanguages,
        ...exportOptions,
      });
      setActiveExport(nextExport);
      let current = nextExport;
      let pollAttempt = 0;
      while (current.status === 'queued' || current.status === 'processing') {
        await delay(exportPollDelay(pollAttempt));
        pollAttempt += 1;
        current = await getBudgetExportStatus(selectedBudget.id, current.id);
        setActiveExport(current);
      }
      if (current.status === 'completed') {
        triggerExportDownload(exportDownloadUrl(current));
      } else {
        throw new Error(current.errorMessage ?? translateCurrent('pdfExportFailed'));
      }
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
      setActiveExport((current) => current === null ? null : {
        ...current,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : translateCurrent('authFailed'),
      });
    } finally {
      setCreatingExportFormat(null);
    }
  };

  const closeExportProgress = () => {
    setActiveExport(null);
  };

  const refreshBankReference = async () => {
    if (activeWorkspaceId === null) {
      setOperationsError(translateCurrent('selectWorkspaceFirst'));

      return;
    }

    setRefreshingExchangeRateSource('bank_reference');
    setOperationsError(null);

    try {
      await refreshBankReferenceRates(activeWorkspaceId);
      setCurrencies(await listCurrencies({
        workspaceId: activeWorkspaceId,
        budgetId: selectedBudget?.id ?? null,
      }));
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : translateCurrent('loadingExchangeRatesFailed'));
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
      const { getPasskeyRegistrationOptions, verifyPasskeyRegistration } = await import('../api/passkeys');
      const options = await getPasskeyRegistrationOptions();
      const { createPasskeyCredential } = await import('../utils/webauthn');
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
      const { updatePasskeyCredential } = await import('../api/passkeys');
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
      const { deletePasskeyCredential } = await import('../api/passkeys');
      setPasskeys(await deletePasskeyCredential(id));
    } catch (error: unknown) {
      setOperationsError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return {
    currencies,
    currencyPresets,
    categories,
    categoryOptions,
    currencyOptions,
    currencyCatalogOptions,
    shares,
    passkeys,
    operationsError,
    setOperationsError,
    isReferenceLoading,
    isCurrencySaving,
    deletingCurrencyId,
    isCategoryLoading,
    isCategorySaving,
    isShareLoading,
    isShareSaving,
    creatingExportFormat,
    activeExport,
    refreshingExchangeRateSource,
    isPasskeyLoading,
    isPasskeyRegistering,
    saveCategory,
    saveCurrency,
    removeCurrency,
    removeCategory,
    removeCategories,
    saveAlias,
    removeAlias,
    createExport,
    closeExportProgress,
    refreshBankReference,
    saveShare,
    removeShare,
    registerPasskey,
    renamePasskey,
    removePasskey,
  };
}

export type OperationsController = ReturnType<typeof useOperationsController>;
