import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, message } from 'antd';
import { getCurrentSession, logout, ssoCallback } from './api/auth';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
import styles from './components/auth/AuthScreen.module.css';
import { appTheme } from './config/appConfig';
import { consumeSsoIntent } from './config/sso';
import type { AppLanguage, I18nKey, I18nValues } from './i18n';
import { I18nContext, antdLocales, normalizeLanguage, translate, useI18n } from './i18n';
import './App.css';
import type { AuthSession } from './types/auth';
import type { SsoAccountActionRequired } from './api/auth';

const AuthFlow = lazy(() => import('./AuthFlow'));
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));
const EmailVerificationScreen = lazy(() =>
  import('./components/auth/EmailVerificationScreen').then((module) => ({
    default: module.EmailVerificationScreen,
  })),
);
const PasswordResetScreen = lazy(() =>
  import('./components/auth/PasswordResetScreen').then((module) => ({
    default: module.PasswordResetScreen,
  })),
);

function initialLanguage(): AppLanguage {
  return normalizeLanguage(
    window.localStorage.getItem('budgetCentre.language') ?? window.navigator.language,
  );
}

const documentLanguageTags: Record<AppLanguage, string> = {
  en: 'en',
  sc: 'zh-Hans',
  tc: 'zh-Hant',
  ja: 'ja',
  fr: 'fr',
  ru: 'ru',
  de: 'de',
};

function replacePath(path: string) {
  window.history.replaceState(null, '', path);
}

interface SsoCallbackScreenProps {
  onAuthenticated: (session: AuthSession) => void;
  onNavigateHome: () => void;
  onNavigateProfile: () => void;
  onNavigatePasswordReset: (token: string) => void;
}

function SsoCallbackScreen({
  onAuthenticated,
  onNavigateHome,
  onNavigateProfile,
  onNavigatePasswordReset,
}: SsoCallbackScreenProps) {
  const { t } = useI18n();
  const [ssoDecision, setSsoDecision] = useState<SsoAccountActionRequired | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [isCreatingSsoAccount, setIsCreatingSsoAccount] = useState(false);
  const hasHandledCallback = useRef(false);
  const callbackHandlersRef = useRef({
    onAuthenticated,
    onNavigateHome,
    onNavigatePasswordReset,
    onNavigateProfile,
    t,
  });

  useEffect(() => {
    callbackHandlersRef.current = {
      onAuthenticated,
      onNavigateHome,
      onNavigatePasswordReset,
      onNavigateProfile,
      t,
    };
  });

  useEffect(() => {
    const handlers = () => callbackHandlersRef.current;

    if (hasHandledCallback.current) {
      return;
    }

    hasHandledCallback.current = true;
    const intent = consumeSsoIntent();
    const mode = intent.mode;

    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const state = query.get('state') ?? undefined;

    if (code === null || code.trim() === '') {
      setCallbackError(handlers().t('authFailed'));

      return;
    }

    let isMounted = true;

    const callbackRequest =
      mode === 'bind'
        ? ssoCallback({ code, state }, 'bind')
        : mode === 'reset'
          ? ssoCallback({ code, state }, 'reset')
        : ssoCallback({ code, state }, 'login');

    callbackRequest
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (mode === 'bind') {
          void message.success(handlers().t('genericSsoBindingSuccess'));
          handlers().onNavigateProfile();
          return;
        }

        if (mode === 'reset') {
          if ('passwordResetToken' in result) {
            handlers().onNavigatePasswordReset(result.passwordResetToken);
          } else {
            setCallbackError(handlers().t('authFailed'));
          }
          return;
        }

        if ('requiresSsoAccountAction' in result) {
          setSsoDecision(result);
          return;
        }

        handlers().onAuthenticated(result as AuthSession);
        handlers().onNavigateHome();
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setCallbackError(error instanceof Error ? error.message : handlers().t('authFailed'));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateSsoAccount = () => {
    if (ssoDecision === null || isCreatingSsoAccount) {
      return;
    }

    setIsCreatingSsoAccount(true);
    ssoCallback(
      {
        action: 'create',
        provider: ssoDecision.ssoAccount.provider,
        ssoCreateToken: ssoDecision.ssoCreateToken,
      },
      'login',
    )
      .then((result) => {
        if ('requiresSsoAccountAction' in result) {
          setSsoDecision(result);
          return;
        }

        onAuthenticated(result);
        onNavigateHome();
      })
      .catch((error: unknown) => {
        void message.error(error instanceof Error ? error.message : t('authFailed'));
      })
      .finally(() => {
        setIsCreatingSsoAccount(false);
      });
  };

  if (ssoDecision !== null) {
    const accountLabel =
      ssoDecision.ssoAccount.email
      ?? ssoDecision.ssoAccount.username
      ?? ssoDecision.ssoAccount.displayName;

    return (
      <main className={styles.loadingShell}>
        <section className={styles.ssoDecisionCard}>
          <div className={styles.loadingBrand}>
            <img
              className={styles.brandLogo}
              src="/favicon.webp"
              alt="BudgetCentre"
              width={48}
              height={48}
            />
            <span className={styles.brandName}>BudgetCentre</span>
            <p className={styles.brandSubtitle}>{t('ssoAccountNotLinked')}</p>
          </div>
          <Alert
            className={styles.authAlert}
            message={t('ssoAccountNotLinkedTitle')}
            description={t('ssoAccountNotLinkedDescription', { account: accountLabel })}
            type="info"
            showIcon
          />
          <div className={styles.ssoDecisionActions}>
            <Button
              className={styles.submitButton}
              type="primary"
              block
              loading={isCreatingSsoAccount}
              onClick={handleCreateSsoAccount}
            >
              {t('ssoCreateAccountAndLogin')}
            </Button>
            <Button className={styles.altButton} block onClick={onNavigateHome}>
              {t('backToLogin')}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (callbackError !== null) {
    return (
      <main className={styles.loadingShell}>
        <section className={styles.ssoDecisionCard}>
          <div className={styles.loadingBrand}>
            <img
              className={styles.brandLogo}
              src="/favicon.webp"
              alt="BudgetCentre"
              width={48}
              height={48}
            />
            <span className={styles.brandName}>BudgetCentre</span>
            <p className={styles.brandSubtitle}>{t('authFailed')}</p>
          </div>
          <Alert
            className={styles.authAlert}
            message={t('authFailed')}
            description={callbackError}
            type="error"
            showIcon
          />
          <div className={styles.ssoDecisionActions}>
            <Button className={styles.submitButton} type="primary" block onClick={onNavigateHome}>
              {t('backToLogin')}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return <AuthLoadingScreen />;
}

function App() {
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  const i18nValue = useMemo(
    () => ({
      language,
      t: (key: I18nKey, values?: I18nValues) => translate(language, key, values),
    }),
    [language],
  );
  const currentUrl = new URL(currentLocation, window.location.origin);
  const isEmailVerificationRoute = currentUrl.pathname === '/email/verify';
  const isPasswordResetRoute = currentUrl.pathname === '/password/reset';
  const isSsoCallbackRoute =
    currentUrl.pathname === '/api/callback'
    || currentUrl.search.includes('sso_callback=1');

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

  useEffect(() => {
    window.localStorage.setItem('budgetCentre.language', language);
    document.documentElement.lang = documentLanguageTags[language];
    document.title = translate(language, 'appMetaTitle');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', translate(language, 'appMetaDescription'));
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', translate(language, 'appMetaTitle'));
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', translate(language, 'appMetaDescription'));
  }, [language]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentLocation(`${window.location.pathname}${window.location.search}`);
    };

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPath = (path: string) => {
    replacePath(path);
    setCurrentLocation(`${window.location.pathname}${window.location.search}`);
  };

  const handleAuthenticated = (nextSession: AuthSession) => {
    setSession(nextSession);
  };

  const handleLogout = () => {
    setIsAuthSubmitting(true);
    logout()
      .catch((error: unknown) => {
        void message.error(
          error instanceof Error ? error.message : translate(language, 'authFailed'),
        );
      })
      .finally(() => {
        setSession(null);
        setIsAuthSubmitting(false);
        navigateToPath('/');
      });
  };

  let content;

  if (isEmailVerificationRoute) {
    content = (
      <Suspense fallback={<AuthLoadingScreen />}>
        <EmailVerificationScreen />
      </Suspense>
    );
  } else if (isPasswordResetRoute) {
    content = (
      <Suspense fallback={<AuthLoadingScreen />}>
        <PasswordResetScreen language={language} onLanguageChange={setLanguage} />
      </Suspense>
    );
  } else if (isSsoCallbackRoute) {
    content = (
      <SsoCallbackScreen
        onAuthenticated={handleAuthenticated}
        onNavigateHome={() => navigateToPath('/')}
        onNavigatePasswordReset={(token) =>
          navigateToPath(`/password/reset?token=${encodeURIComponent(token)}`)}
        onNavigateProfile={() => navigateToPath('/profile')}
      />
    );
  } else if (isSessionLoading) {
    content = <AuthLoadingScreen />;
  } else if (session === null) {
    content = (
      <Suspense fallback={<AuthLoadingScreen />}>
        <AuthFlow
          language={language}
          onAuthenticated={handleAuthenticated}
          onLanguageChange={setLanguage}
        />
      </Suspense>
    );
  } else {
    content = (
      <Suspense fallback={<AuthLoadingScreen />}>
        <AuthenticatedApp
          session={session}
          setSession={setSession}
          isAuthSubmitting={isAuthSubmitting}
          language={language}
          onLanguageChange={setLanguage}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  return (
    <ConfigProvider
      button={{ autoInsertSpace: false }}
      getPopupContainer={(node) => node?.parentElement ?? document.body}
      locale={antdLocales[language]}
      theme={appTheme}
    >
      <I18nContext.Provider value={i18nValue}>{content}</I18nContext.Provider>
    </ConfigProvider>
  );
}

export default App;
