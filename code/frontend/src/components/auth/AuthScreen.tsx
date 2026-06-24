import { Alert, Button, Divider, Form, Input, Progress, Select, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import { KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import { startCasdoorSignin } from '../../config/casdoor';
import type { AppLanguage } from '../../i18n';
import { languageOptions, useI18n } from '../../i18n';
import type { CurrencyCode } from '../../types/budget';
import type { AuthFormValues, AuthMode } from '../../types/forms';
import { passwordProgressStatus, passwordStrengthFor } from '../../utils/password';
import styles from './AuthScreen.module.css';

interface AuthScreenProps {
  form: FormInstance<AuthFormValues>;
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  language: AppLanguage;
  currencyOptions: Array<{ label: string; value: CurrencyCode }>;
  watchedPassword: string | undefined;
  onFinish: (values: AuthFormValues) => Promise<void>;
  onLanguageChange: (language: AppLanguage) => void;
  onModeChange: (mode: AuthMode) => void;
  onPasskeyLogin: () => Promise<void>;
}

export function AuthScreen({
  form,
  mode,
  error,
  notice,
  isSubmitting,
  language,
  currencyOptions,
  watchedPassword,
  onFinish,
  onLanguageChange,
  onModeChange,
  onPasskeyLogin,
}: AuthScreenProps) {
  const { t } = useI18n();
  const passwordStrength = passwordStrengthFor(watchedPassword);
  const passwordProgressPercent = Math.min((watchedPassword?.length ?? 0) * 10, 100);
  const passwordStrengthLabels = {
    poor: t('passwordStrengthPoor'),
    pass: t('passwordStrengthPass'),
    ok: t('passwordStrengthOk'),
  };
  const handleSsoLogin = () => {
    startCasdoorSignin('login');
  };
  const submitText = mode === 'login' ? t('login') : t('createAccount');

  return (
    <main className={styles.shell}>
      <Select<AppLanguage>
        aria-label="Language"
        className={styles.languageSwitcher}
        popupClassName="language-switcher-popup"
        options={languageOptions}
        value={language}
        onChange={onLanguageChange}
      />

      <div className={styles.panel}>
        <header className={styles.brand}>
          <img className={styles.brandLogo} src="/favicon.webp" alt="BudgetCentre" width={48} height={48} />
          <span className={styles.brandName}>BudgetCentre</span>
          <p className={styles.brandSubtitle}>{t('loginSubtitle')}</p>
        </header>

        <Tabs
          className={styles.modeTabs}
          activeKey={mode}
          centered
          items={[
            { key: 'login', label: t('loginTab') },
            { key: 'register', label: t('createAccount') },
          ]}
          onChange={(key) => onModeChange(key as AuthMode)}
        />

        {error ? (
          <Alert className={styles.authAlert} type="error" showIcon message={error} />
        ) : null}
        {notice ? (
          <Alert className={styles.authAlert} type="success" showIcon message={notice} />
        ) : null}

        <Form<AuthFormValues>
          className={styles.authForm}
          form={form}
          initialValues={{ defaultCurrency: 'CNY' }}
          layout="vertical"
          requiredMark={false}
          scrollToFirstError={{ focus: true }}
          onFinish={(values) => {
            void onFinish(values);
          }}
        >
          {mode === 'register' ? (
            <>
              <Form.Item
                label={t('username')}
                name="username"
                rules={[
                  { required: true, message: t('usernameRequired') },
                  {
                    pattern: /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/,
                    message: t('usernamePattern'),
                  },
                ]}
              >
                <Input autoComplete="username" prefix={<UserRound size={16} />} size="large" />
              </Form.Item>
              <Form.Item
                label={t('displayName')}
                name="displayName"
                rules={[{ required: true, message: t('displayNameRequired') }]}
              >
                <Input autoComplete="name" prefix={<UserRound size={16} />} size="large" />
              </Form.Item>
            </>
          ) : null}

          <Form.Item
            label={mode === 'login' ? t('usernameOrEmail') : t('email')}
            name={mode === 'login' ? 'identifier' : 'email'}
            rules={[
              {
                required: true,
                message: mode === 'login' ? t('usernameOrEmailRequired') : t('emailRequired'),
              },
              ...(mode === 'register'
                ? [{ type: 'email' as const, message: t('emailFormatInvalid') }]
                : []),
            ]}
          >
            <Input
              autoComplete={mode === 'login' ? 'username' : 'email'}
              prefix={<UserRound size={16} />}
              size="large"
            />
          </Form.Item>

          <Form.Item
            label={t('password')}
            name="password"
            rules={[
              { required: true, message: t('passwordRequired') },
              ...(mode === 'register' ? [{ min: 10, message: t('passwordMin') }] : []),
            ]}
          >
            <Input.Password
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              prefix={<LockKeyhole size={16} />}
              size="large"
            />
          </Form.Item>

          {mode === 'register' ? (
            <>
              <div
                className={`${styles.passwordStrength} ${
                  styles[`passwordStrength${passwordStrength}`]
                }`}
              >
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
                label={t('confirmPassword')}
                name="confirmPassword"
                rules={[
                  { required: true, message: t('confirmPassword') },
                  ({ getFieldValue }) => ({
                    validator(_, value: unknown) {
                      return value === getFieldValue('password')
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('passwordMismatch')));
                    },
                  }),
                ]}
              >
                <Input.Password
                  autoComplete="new-password"
                  prefix={<LockKeyhole size={16} />}
                  size="large"
                />
              </Form.Item>

              <Form.Item
                label={t('defaultCurrency')}
                name="defaultCurrency"
                rules={[
                  { required: true, message: t('selectDefaultCurrency') },
                  {
                    validator: (_, value: unknown) =>
                      typeof value === 'string'
                        && currencyOptions.some((option) => option.value === value)
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('supportedCurrencyOnly'))),
                  },
                ]}
              >
                <Select options={currencyOptions} size="large" />
              </Form.Item>
            </>
          ) : null}

          <Button
            block
            className={styles.submitButton}
            htmlType="submit"
            loading={isSubmitting}
            size="large"
            type="primary"
          >
            {submitText}
          </Button>
        </Form>

        {mode === 'login' ? (
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
              onClick={() => void onPasskeyLogin()}
            >
              {t('loginWithPasskey')}
            </Button>
            <Button
              block
              className={styles.altButton}
              disabled={isSubmitting}
              size="large"
              onClick={handleSsoLogin}
            >
              {t('loginWithAxchenSso')}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
