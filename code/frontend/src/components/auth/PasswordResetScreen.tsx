import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Progress, Result, Select, Spin } from 'antd';
import { KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react';
import {
  completePasswordReset,
  getSsoProviders,
  requestPasswordResetEmail,
  verifyPasswordResetToken,
} from '../../api/auth';
import { startSsoSignin } from '../../config/sso';
import type { AppLanguage } from '../../i18n';
import { languageOptions, useI18n } from '../../i18n';
import type { SsoProvider } from '../../types/auth';
import { passwordProgressStatus, passwordStrengthFor } from '../../utils/password';
import styles from './AuthScreen.module.css';

interface PasswordResetScreenProps {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}

interface EmailFormValues {
  email: string;
}

interface ResetFormValues {
  password: string;
  confirmPassword: string;
}

type ResetState =
  | { status: 'request' }
  | { status: 'checking' }
  | { status: 'ready'; email: string | null }
  | { status: 'done' }
  | { status: 'error'; message: string };

export function PasswordResetScreen({
  language,
  onLanguageChange,
}: PasswordResetScreenProps) {
  const { t } = useI18n();
  const [emailForm] = Form.useForm<EmailFormValues>();
  const [resetForm] = Form.useForm<ResetFormValues>();
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [state, setState] = useState<ResetState>(() =>
    initialToken() === '' ? { status: 'request' } : { status: 'checking' },
  );
  const [resetToken, setResetToken] = useState(initialToken);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const watchedPassword = Form.useWatch('password', resetForm);
  const passwordStrength = passwordStrengthFor(watchedPassword);
  const passwordProgressPercent = Math.min((watchedPassword?.length ?? 0) * 10, 100);
  const passwordStrengthLabels = {
    poor: t('passwordStrengthPoor'),
    pass: t('passwordStrengthPass'),
    ok: t('passwordStrengthOk'),
  };

  useEffect(() => {
    let isMounted = true;
    getSsoProviders()
      .then((result) => {
        if (isMounted) {
          setSsoProviders(result.providers);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSsoProviders([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (resetToken === '') {
      return;
    }

    let isMounted = true;
    verifyPasswordResetToken(resetToken)
      .then((result) => {
        if (isMounted) {
          setState({ status: 'ready', email: result.email });
        }
      })
      .catch((caught: unknown) => {
        if (isMounted) {
          setState({
            status: 'error',
            message: caught instanceof Error ? caught.message : t('passwordResetTokenInvalid'),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [resetToken, t]);

  const handleEmailRequest = async (values: EmailFormValues) => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await requestPasswordResetEmail(values.email.trim());
      setNotice(t('passwordResetEmailSent'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeyReset = async () => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const values = await emailForm.validateFields(['email']);
      const { getPasskeyResetOptions, verifyPasskeyReset } = await import('../../api/passkeys');
      const passkeyOptions = await getPasskeyResetOptions(values.email.trim());
      const { getPasskeyCredential } = await import('../../utils/webauthn');
      const credential = await getPasskeyCredential(passkeyOptions);
      const result = await verifyPasskeyReset(credential);
      acceptResetToken(result.passwordResetToken, values.email.trim());
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async (values: ResetFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await completePasswordReset({ token: resetToken, password: values.password });
      resetForm.resetFields();
      setState({ status: 'done' });
      window.history.replaceState(null, '', '/password/reset');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const acceptResetToken = (token: string, email: string | null) => {
    window.history.replaceState(null, '', `/password/reset?token=${encodeURIComponent(token)}`);
    setResetToken(token);
    setState({ status: 'ready', email });
  };

  return (
    <main className={styles.shell}>
      <Select<AppLanguage>
        aria-label={t('languageSwitcher')}
        className={styles.languageSwitcher}
        popupClassName="language-switcher-popup"
        options={languageOptions}
        value={language}
        onChange={onLanguageChange}
      />

      <section className={styles.panel}>
        <header className={styles.brand}>
          <img className={styles.brandLogo} src="/favicon.webp" alt="BudgetCentre" width={48} height={48} />
          <span className={styles.brandName}>BudgetCentre</span>
          <p className={styles.brandSubtitle}>{t('passwordResetTitle')}</p>
        </header>

        {state.status === 'checking' ? (
          <div className="verification-loading">
            <Spin size="large" />
            <span>{t('passwordResetChecking')}</span>
          </div>
        ) : state.status === 'done' ? (
          <Result
            status="success"
            title={t('passwordResetSuccess')}
            subTitle={t('passwordResetSuccessMessage')}
            extra={
              <Button type="primary" href="/">
                {t('returnToLogin')}
              </Button>
            }
          />
        ) : state.status === 'error' ? (
          <Result
            status="error"
            title={t('passwordResetFailed')}
            subTitle={state.message}
            extra={
              <Button type="primary" href="/password/reset">
                {t('tryAgain')}
              </Button>
            }
          />
        ) : state.status === 'ready' ? (
          <>
            {error ? <Alert className={styles.authAlert} type="error" showIcon message={error} /> : null}
            {state.email ? (
              <Alert
                className={styles.authAlert}
                type="info"
                showIcon
                message={t('passwordResetReadyFor', { email: state.email })}
              />
            ) : null}
            <Form<ResetFormValues>
              className={styles.authForm}
              form={resetForm}
              layout="vertical"
              requiredMark={false}
              scrollToFirstError={{ focus: true }}
              onFinish={(values) => {
                void handlePasswordReset(values);
              }}
            >
              <Form.Item
                label={t('newPassword')}
                name="password"
                rules={[
                  { required: true, message: t('passwordRequired') },
                  { min: 10, message: t('passwordMin') },
                ]}
              >
                <Input.Password autoComplete="new-password" prefix={<LockKeyhole size={16} />} size="large" />
              </Form.Item>

              <div className={`${styles.passwordStrength} ${styles[`passwordStrength${passwordStrength}`]}`}>
                <span>{passwordStrengthLabels[passwordStrength]}</span>
                <Progress
                  percent={passwordProgressPercent}
                  showInfo={false}
                  size="small"
                  status={passwordProgressStatus[passwordStrength]}
                />
              </div>

              <Form.Item
                dependencies={['password']}
                label={t('newPasswordConfirm')}
                name="confirmPassword"
                rules={[
                  { required: true, message: t('newPasswordConfirm') },
                  ({ getFieldValue }) => ({
                    validator(_, value: unknown) {
                      return value === getFieldValue('password')
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('passwordMismatch')));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" prefix={<LockKeyhole size={16} />} size="large" />
              </Form.Item>

              <Button block className={styles.submitButton} htmlType="submit" loading={isSubmitting} size="large" type="primary">
                {t('passwordResetSubmit')}
              </Button>
            </Form>
          </>
        ) : (
          <>
            {error ? <Alert className={styles.authAlert} type="error" showIcon message={error} /> : null}
            {notice ? <Alert className={styles.authAlert} type="success" showIcon message={notice} /> : null}
            <Form<EmailFormValues>
              className={styles.authForm}
              form={emailForm}
              layout="vertical"
              requiredMark={false}
              scrollToFirstError={{ focus: true }}
              onFinish={(values) => {
                void handleEmailRequest(values);
              }}
            >
              <Form.Item
                label={t('email')}
                name="email"
                rules={[
                  { required: true, message: t('emailRequired') },
                  { type: 'email', message: t('emailValidRequired') },
                ]}
              >
                <Input autoComplete="email" prefix={<UserRound size={16} />} size="large" />
              </Form.Item>

              <Button block className={styles.submitButton} htmlType="submit" loading={isSubmitting} size="large" type="primary" icon={<Mail size={16} />}>
                {t('passwordResetEmailAction')}
              </Button>
            </Form>

            <div className={styles.altActions}>
              <Divider className={styles.altDivider} plain>
                {t('authDividerOr')}
              </Divider>
              <Button
                block
                className={styles.altButton}
                icon={<KeyRound size={16} />}
                loading={isSubmitting}
                size="large"
                onClick={() => void handlePasskeyReset()}
              >
                {t('passwordResetWithPasskey')}
              </Button>
              {ssoProviders.map((provider) => (
                <Button
                  block
                  className={styles.altButton}
                  disabled={isSubmitting}
                  icon={<KeyRound size={16} />}
                  key={provider.provider}
                  size="large"
                  onClick={() => startSsoSignin(provider, 'reset')}
                >
                  {t('passwordResetWithSso', { provider: provider.name })}
                </Button>
              ))}
            </div>
            <Button className={styles.backLinkButton} type="link" href="/">
              {t('backToLogin')}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

function initialToken() {
  return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
}
