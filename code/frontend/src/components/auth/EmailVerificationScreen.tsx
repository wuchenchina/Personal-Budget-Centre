import { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import { verifyEmailToken } from '../../api/auth';
import { translateCurrent, useI18n } from '../../i18n';

type VerificationState =
  | { status: 'loading' }
  | { status: 'success'; alreadyVerified: boolean }
  | { status: 'error'; message: string };

export function EmailVerificationScreen() {
  const { t } = useI18n();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<VerificationState>(() =>
    token === ''
      ? { status: 'error', message: translateCurrent('emailVerificationMissingToken') }
      : { status: 'loading' },
  );

  useEffect(() => {
    if (token === '') {
      return;
    }

    let isMounted = true;
    verifyEmailToken(token)
      .then((result) => {
        if (isMounted) {
          setState({ status: 'success', alreadyVerified: result.alreadyVerified });
        }
      })
      .catch((caught: unknown) => {
        if (isMounted) {
          setState({
            status: 'error',
            message: caught instanceof Error ? caught.message : t('emailVerificationFailedMessage'),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [t, token]);

  return (
    <main className="auth-shell">
      <div className="verification-panel">
        {state.status === 'loading' ? (
          <div className="verification-loading">
            <Spin size="large" />
            <span>{t('emailVerifying')}</span>
          </div>
        ) : state.status === 'success' ? (
          <Result
            status="success"
            title={state.alreadyVerified ? t('emailVerified') : t('emailVerificationSuccess')}
            subTitle={t('verifyEmailNowAvailable')}
            extra={
              <Button type="primary" href="/">
                {t('returnToLogin')}
              </Button>
            }
          />
        ) : (
          <Result
            status="error"
            title={t('emailVerificationFailed')}
            subTitle={state.message}
            extra={
              <Button type="primary" href="/">
                {t('returnToLogin')}
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}
