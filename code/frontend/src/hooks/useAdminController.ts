import { useEffect, useState } from 'react';
import {
  cleanupAdminExports,
  createAdminUser,
  getAdminDatabaseStatus,
  getAdminEnvironment,
  listAdminLogs,
  listAdminUsers,
  runAdminDatabaseMigration,
  resendAdminEmailVerification,
  updateAdminUser,
  type AdminUserListParams,
} from '../api/admin';
import { listCurrencyPresets } from '../api/referenceData';
import type {
  AdminEnvironmentCheck,
  AdminDatabaseStatus,
  AdminLogEntry,
  AdminUser,
  AdminUserCreatePayload,
  AdminUserUpdatePayload,
} from '../types/admin';
import type { UserStatus } from '../types/auth';
import { translateCurrent } from '../i18n';
import { buildCurrencyOptions, type CurrencySelectOption } from '../utils/currencyOptions';

export function useAdminController(enabled: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [isUserCreating, setIsUserCreating] = useState(false);
  const [environment, setEnvironment] = useState<AdminEnvironmentCheck | null>(null);
  const [isEnvironmentLoading, setIsEnvironmentLoading] = useState(false);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isExportCleaning, setIsExportCleaning] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<AdminDatabaseStatus | null>(null);
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencySelectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      listCurrencyPresets()
        .then((currencies) => {
          if (!isMounted) {
            return;
          }
          setCurrencyOptions(buildCurrencyOptions(currencies));
        })
        .catch(() => {
          if (isMounted) {
            setCurrencyOptions([]);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    const params: AdminUserListParams = { search, status, page, pageSize };

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setLoading(true);
      listAdminUsers(params)
        .then((result) => {
          if (!isMounted) {
            return;
          }
          setUsers(result.users);
          setTotal(result.total);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : translateCurrent('authFailed'));
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
  }, [enabled, page, pageSize, search, status]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }

      setIsLogsLoading(true);
      listAdminLogs()
        .then((result) => {
          if (!isMounted) {
            return;
          }
          setLogs(normalizeAdminLogEntries(result.entries));
          setLogPath(result.path);
        })
        .catch((caught: unknown) => {
          if (isMounted) {
            setError(caught instanceof Error ? caught.message : translateCurrent('logsLoadFailed'));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLogsLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const createUser = async (payload: AdminUserCreatePayload): Promise<boolean> => {
    setIsUserCreating(true);
    setError(null);
    setNotice(null);

    try {
      const createdUser = await createAdminUser(payload);
      setSearch('');
      setStatus('all');
      setPage(1);
      setUsers((currentUsers) => [createdUser, ...currentUsers].slice(0, pageSize));
      setTotal((currentTotal) => currentTotal + 1);
      setNotice(translateCurrent('adminUserCreated', { email: createdUser.email }));

      return true;
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('authFailed'));

      return false;
    } finally {
      setIsUserCreating(false);
    }
  };

  const updateUser = async (payload: AdminUserUpdatePayload) => {
    setSavingUserId(payload.id);
    setError(null);
    setNotice(null);

    try {
      const updatedUser = await updateAdminUser(payload);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setNotice(translateCurrent('profileUpdated'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('authFailed'));
    } finally {
      setSavingUserId(null);
    }
  };

  const resendVerification = async (id: number) => {
    setSavingUserId(id);
    setError(null);
    setNotice(null);

    try {
      const result = await resendAdminEmailVerification(id);
      setNotice(
        result.alreadyVerified
          ? `${result.email} ${translateCurrent('emailVerified')}`
          : translateCurrent('emailSent', { email: result.email }),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('authFailed'));
    } finally {
      setSavingUserId(null);
    }
  };

  const applySearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const applyStatus = (value: UserStatus | 'all') => {
    setStatus(value);
    setPage(1);
  };

  const checkEnvironment = async () => {
    setIsEnvironmentLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await getAdminEnvironment();
      setEnvironment(result);
      setNotice(
        result.ok
          ? translateCurrent('environmentCheckPassed')
          : translateCurrent('environmentCheckNeedsAttention'),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('environmentCheckFailed'));
    } finally {
      setIsEnvironmentLoading(false);
    }
  };

  const cleanupExports = async () => {
    setIsExportCleaning(true);
    setError(null);
    setNotice(null);

    try {
      const result = await cleanupAdminExports();
      setNotice(
        translateCurrent('exportCleanupDone', {
          exports: result.deletedExports,
          files: result.deletedExportFiles,
          tempFiles: result.deletedTempFiles,
        }),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('exportCleanupFailed'));
    } finally {
      setIsExportCleaning(false);
    }
  };

  const refreshLogs = async () => {
    setIsLogsLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await listAdminLogs();
      setLogs(normalizeAdminLogEntries(result.entries));
      setLogPath(result.path);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('logsLoadFailed'));
    } finally {
      setIsLogsLoading(false);
    }
  };

  const refreshDatabaseStatus = async () => {
    setIsDatabaseLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await getAdminDatabaseStatus();
      const status = normalizeAdminDatabaseStatus(result);
      setDatabaseStatus(status);
      setNotice(translateCurrent('databaseStatusUpdated', { count: status.pending.length }));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('databaseStatusLoadFailed'));
    } finally {
      setIsDatabaseLoading(false);
    }
  };

  const dryRunDatabaseMigration = async () => {
    setIsDatabaseLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await runAdminDatabaseMigration(true);
      setNotice(translateCurrent('databaseDryRunDone', { count: result.pending?.length ?? 0 }));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('databaseDryRunFailed'));
    } finally {
      setIsDatabaseLoading(false);
    }
  };

  const retryDatabaseMigration = async () => {
    setIsDatabaseLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await runAdminDatabaseMigration(false);
      if (result.database) {
        setDatabaseStatus(normalizeAdminDatabaseStatus(result.database));
      }
      setNotice(translateCurrent('databaseMigrationRetryDone'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : translateCurrent('databaseMigrationRetryFailed'));
    } finally {
      setIsDatabaseLoading(false);
    }
  };

  return {
    users,
    total,
    search,
    status,
    page,
    pageSize,
    loading,
    savingUserId,
    isUserCreating,
    environment,
    isEnvironmentLoading,
    logs,
    logPath,
    isLogsLoading,
    isExportCleaning,
    databaseStatus,
    isDatabaseLoading,
    currencyOptions,
    error,
    notice,
    applySearch,
    applyStatus,
    setPage,
    setPageSize,
    createUser,
    updateUser,
    resendVerification,
    checkEnvironment,
    refreshLogs,
    cleanupExports,
    refreshDatabaseStatus,
    dryRunDatabaseMigration,
    retryDatabaseMigration,
  };
}

export type AdminController = ReturnType<typeof useAdminController>;

function normalizeAdminLogEntries(entries: AdminLogEntry[] | null | undefined): AdminLogEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => ({
    ...entry,
    trace: Array.isArray(entry.trace) ? entry.trace : [],
    query: entry.query && typeof entry.query === 'object' ? entry.query : {},
    file: entry.file ?? '',
    exception: entry.exception ?? '',
    message: entry.message ?? '',
  }));
}

function normalizeAdminDatabaseStatus(status: AdminDatabaseStatus): AdminDatabaseStatus {
  return {
    ...status,
    applied: Array.isArray(status.applied) ? status.applied : [],
    pending: Array.isArray(status.pending) ? status.pending : [],
  };
}
