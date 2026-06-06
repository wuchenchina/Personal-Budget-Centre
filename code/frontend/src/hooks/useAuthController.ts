import { useEffect, useState } from 'react';
import { Form } from 'antd';
import { getCurrentSession, login, logout, register } from '../api/auth';
import type { AuthSession } from '../types/auth';
import type { AuthFormValues, AuthMode } from '../types/forms';
import { toCurrencyCode } from '../utils/budgetTemplate';

interface UseAuthControllerOptions {
  onLogout?: () => void;
}

export function useAuthController(options: UseAuthControllerOptions = {}) {
  const [authForm] = Form.useForm<AuthFormValues>();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const watchedPassword = Form.useWatch('password', authForm);

  useEffect(() => {
    let isMounted = true;

    getCurrentSession()
      .then((nextSession) => {
        if (isMounted) {
          setSession(nextSession);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAuthFinish = async (values: AuthFormValues) => {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      const nextSession =
        authMode === 'register'
          ? await register({
              displayName: values.displayName?.trim() ?? '',
              email: values.email.trim(),
              password: values.password,
              defaultCurrency: toCurrencyCode(values.defaultCurrency),
            })
          : await login({
              email: values.email.trim(),
              password: values.password,
            });

      setSession(nextSession);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthSubmitting(true);

    try {
      await logout();
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : 'Logout failed.');
    } finally {
      setSession(null);
      setAuthMode('login');
      setIsAuthSubmitting(false);
      options.onLogout?.();
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError(null);
    authForm.resetFields();
    authForm.setFieldValue('defaultCurrency', 'CNY');
  };

  return {
    authForm,
    authMode,
    authError,
    session,
    setSession,
    isAuthSubmitting,
    isSessionLoading,
    watchedPassword,
    handleAuthFinish,
    handleLogout,
    switchAuthMode,
  };
}

export type AuthController = ReturnType<typeof useAuthController>;
