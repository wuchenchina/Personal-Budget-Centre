import { useEffect, useState } from 'react';
import { Form } from 'antd';
import { getCurrentSession, login, logout, register } from '../api/auth';
import { getPasskeyLoginOptions, verifyPasskeyLogin } from '../api/passkeys';
import type { AuthSession } from '../types/auth';
import type { AuthFormValues, AuthMode } from '../types/forms';
import { toCurrencyCode } from '../utils/budgetTemplate';
import { getPasskeyCredential } from '../utils/webauthn';

interface UseAuthControllerOptions {
  onLogout?: () => void;
}

export function useAuthController(options: UseAuthControllerOptions = {}) {
  const [authForm] = Form.useForm<AuthFormValues>();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
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
    setAuthNotice(null);

    try {
      if (authMode === 'register') {
        const result = await register({
          identifier: values.email?.trim() ?? '',
          username: values.username?.trim() ?? '',
          displayName: values.displayName?.trim() ?? '',
          email: values.email?.trim() ?? '',
          password: values.password,
          defaultCurrency: toCurrencyCode(values.defaultCurrency),
        });

        if ('requiresEmailVerification' in result) {
          setAuthMode('login');
          setAuthNotice(`验证邮件已发送至 ${result.email}，请验证后再登录。`);
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

      setSession(nextSession);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : '认证失败。');
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
      const passkeyOptions = await getPasskeyLoginOptions(
        typeof email === 'string' ? email : undefined,
      );
      const credential = await getPasskeyCredential(passkeyOptions);
      const nextSession = await verifyPasskeyLogin(credential);

      setSession(nextSession);
      setAuthError(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : '通行密钥登录失败。');
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
      setAuthError(error instanceof Error ? error.message : '退出登录失败。');
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
    authForm.setFieldValue('defaultCurrency', 'CNY');
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
    watchedPassword,
    handleAuthFinish,
    handlePasskeyLogin,
    handleLogout,
    switchAuthMode,
  };
}

export type AuthController = ReturnType<typeof useAuthController>;
