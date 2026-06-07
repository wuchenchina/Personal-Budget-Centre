import { useEffect, useState } from 'react';
import {
  getAdminEnvironment,
  listAdminUsers,
  resendAdminEmailVerification,
  updateAdminUser,
  type AdminUserListParams,
} from '../api/admin';
import type { AdminEnvironmentCheck, AdminUser, AdminUserUpdatePayload } from '../types/admin';
import type { UserStatus } from '../types/auth';
import { translateCurrent } from '../i18n';

export function useAdminController(enabled: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [environment, setEnvironment] = useState<AdminEnvironmentCheck | null>(null);
  const [isEnvironmentLoading, setIsEnvironmentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  return {
    users,
    total,
    search,
    status,
    page,
    pageSize,
    loading,
    savingUserId,
    environment,
    isEnvironmentLoading,
    error,
    notice,
    applySearch,
    applyStatus,
    setPage,
    setPageSize,
    updateUser,
    resendVerification,
    checkEnvironment,
  };
}

export type AdminController = ReturnType<typeof useAdminController>;
