import { useEffect } from 'react';
import { AuthScreen } from './components/auth/AuthScreen';
import { useAuthController } from './hooks/useAuthController';
import type { AppLanguage } from './i18n';
import type { AuthSession } from './types/auth';

interface AuthFlowProps {
  language: AppLanguage;
  onAuthenticated: (session: AuthSession) => void;
  onLanguageChange: (language: AppLanguage) => void;
}

function AuthFlow({
  language,
  onAuthenticated,
  onLanguageChange,
}: AuthFlowProps) {
  const auth = useAuthController({
    loadSession: false,
  });

  useEffect(() => {
    if (auth.session !== null) {
      onAuthenticated(auth.session);
    }
  }, [auth.session, onAuthenticated]);

  if (auth.session !== null) {
    return null;
  }

  return (
    <AuthScreen
      form={auth.authForm}
      mode={auth.authMode}
      error={auth.authError}
      notice={auth.authNotice}
      isSubmitting={auth.isAuthSubmitting}
      language={language}
      currencyOptions={auth.currencyOptions}
      watchedPassword={auth.watchedPassword}
      onFinish={auth.handleAuthFinish}
      onLanguageChange={onLanguageChange}
      onModeChange={auth.switchAuthMode}
      onPasskeyLogin={auth.handlePasskeyLogin}
    />
  );
}

export default AuthFlow;
