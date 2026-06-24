import { useEffect, useState } from 'react';
import { Form } from 'antd';
import { completeSsoMerge, getCurrentSession, login, logout, register } from '../api/auth';
import { listCurrencyPresets } from '../api/referenceData';
import { consumePendingSsoMergeToken, hasPendingSsoMergeToken } from '../config/ssoMerge';
import type { AuthSession } from '../types/auth';
import type { AuthFormValues, AuthMode } from '../types/forms';
import { translateCurrent } from '../i18n';
import { toOptionalCurrencyCode } from '../utils/currencyCode';
import { buildCurrencyOptions, type CurrencySelectOption } from '../utils/currencyOptions';

interface UseAuthControllerOptions {
  initialSession?: AuthSession | null;
  loadSession?: boolean;
  onLogout?: () => void;
}

export function useAuthController(options: UseAuthControllerOptions = {}) {
  const [authForm] = Form.useForm<AuthFormValues>();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(
    hasPendingSsoMergeToken() ? translateCurrent('ssoMergeLoginPrompt') : null,
  );
  const [session, setSession] = useState<AuthSession | null>(options.initialSession ?? null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(options.loadSession !== false);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencySelectOption[]>([]);
  const watchedPassword = Form.useWatch('password', authForm);

  useEffect(() => {
    let isMounted = true;

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

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (options.loadSession === false) {
      return;
    }

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
  }, [options.loadSession]);

  const handleAuthFinish = async (values: AuthFormValues) => {
    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      if (authMode === 'register') {
        const defaultCurrency = toOptionalCurrencyCode(values.defaultCurrency);
        if (defaultCurrency !== null && !currencyOptions.some((option) => option.value === defaultCurrency)) {
          throw new Error(translateCurrent('supportedCurrencyOnly'));
        }

        const result = await register({
          identifier: values.email?.trim() ?? '',
          username: values.username?.trim() ?? '',
          displayName: values.displayName?.trim() ?? '',
          email: values.email?.trim() ?? '',
          password: values.password,
          defaultCurrency: defaultCurrency ?? undefined,
        });

        if ('requiresEmailVerification' in result) {
          setAuthMode('login');
          setAuthNotice(translateCurrent('emailSent', { email: result.email }));
          authForm.setFieldsValue({
            identifier: result.email,
            email: result.email,
            password: '',
            confirmPassword: '',
          });
          return;
        }

        setSession(result);
        setAuthError(null);
        return;
      }

      const nextSession = await login({
        identifier: values.identifier?.trim() ?? '',
        password: values.password,
      });

      const merged = await completePendingSsoMerge(nextSession);
      if (merged.completed) {
        setAuthNotice(translateCurrent('ssoMergeComplete'));
      }
      setSession(merged.session);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : translateCurrent('authFailed'));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      const email = authForm.getFieldValue('identifier') ?? authForm.getFieldValue('email');
      const { getPasskeyLoginOptions, verifyPasskeyLogin } = await import('../api/passkeys');
      const passkeyOptions = await getPasskeyLoginOptions(
        typeof email === 'string' ? email : undefined,
      );
      const { getPasskeyCredential } = await import('../utils/webauthn');
      const credential = await getPasskeyCredential(passkeyOptions);
      const nextSession = await verifyPasskeyLogin(credential);

      const merged = await completePendingSsoMerge(nextSession);
      if (merged.completed) {
        setAuthNotice(translateCurrent('ssoMergeComplete'));
      }
      setSession(merged.session);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
      setAuthError(error instanceof Error ? error.message : translateCurrent('authFailed'));
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
    setAuthNotice(null);
    authForm.resetFields();
  };

  return {
    authForm,
    authMode,
    authError,
    authNotice,
    session,
    setSession,
    isAuthSubmitting,
    isSessionLoading,
    currencyOptions,
    watchedPassword,
    handleAuthFinish,
    handlePasskeyLogin,
    handleLogout,
    switchAuthMode,
  };
}

export type AuthController = ReturnType<typeof useAuthController>;

async function completePendingSsoMerge(
  session: AuthSession,
): Promise<{ session: AuthSession; completed: boolean }> {
  const mergeToken = consumePendingSsoMergeToken();
  if (mergeToken === null) {
    return { session, completed: false };
  }

  const result = await completeSsoMerge(mergeToken);

  return { session: result.session, completed: true };
}
