import { Alert, Button, Divider, Form, Input, Progress, Select, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import { KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import { startSsoSignin } from '../../config/sso';
import type { AppLanguage } from '../../i18n';
import { languageOptions, useI18n } from '../../i18n';
import type { SsoProvider } from '../../types/auth';
import type { AuthFormValues, AuthMode } from '../../types/forms';
import { renderCurrencyOption, type CurrencySelectOption } from '../../utils/currencyOptions';
import { passwordProgressStatus, passwordStrengthFor } from '../../utils/password';
import styles from './AuthScreen.module.css';

interface AuthScreenProps {
  form: FormInstance<AuthFormValues>;
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  language: AppLanguage;
  ssoProviders: SsoProvider[];
  currencyOptions: CurrencySelectOption[];
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
  ssoProviders,
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
  const hasSsoProviders = ssoProviders.length > 0;
  const useSideColumn = 1 + ssoProviders.length > 2;
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

      <div className={`${styles.panel} ${mode === 'login' && useSideColumn ? styles.loginPanel : ''}`}>
        <header className={styles.brand}>
          <img className={styles.brandLogo} src="/favicon.webp" alt="BudgetCentre" width={48} height={48} />
          <span className={styles.brandName}>BudgetCentre</span>
          <p className={styles.brandSubtitle}>{t('loginSubtitle')}</p>
        </header>

        <div className={styles.authBody}>
          <div className={styles.primaryColumn}>
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
                      {
                        validator: (_, value: unknown) =>
                          value === undefined
                            || value === null
                            || value === ''
                            || (typeof value === 'string'
                              && currencyOptions.some((option) => option.value === value))
                            ? Promise.resolve()
                            : Promise.reject(new Error(t('supportedCurrencyOnly'))),
                      },
                    ]}
                  >
                    <Select
                      allowClear
                      notFoundContent={t('noCurrencies')}
                      optionFilterProp="label"
                      optionLabelProp="value"
                      optionRender={renderCurrencyOption}
                      options={currencyOptions}
                      placeholder={t('defaultCurrencyPlaceholder')}
                      showSearch
                      size="large"
                    />
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
          </div>

          {mode === 'login' ? (
            <div className={styles.secondaryColumn}>
              <div className={styles.altActions}>
                {hasSsoProviders ? (
                  <Divider className={styles.altDivider} plain>
                    {t('authDividerOr')}
                  </Divider>
                ) : null}
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
                {ssoProviders.map((provider) => (
                  <Button
                    block
                    className={styles.altButton}
                    disabled={isSubmitting}
                    icon={<SsoProviderLogo provider={provider} />}
                    key={provider.provider}
                    size="large"
                    onClick={() => startSsoSignin(provider, 'login')}
                  >
                    {provider.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function SsoProviderLogo({ provider }: { provider: SsoProvider }) {
  if (provider.provider === 'linux_do' || provider.logo === 'linux_do') {
    return (
      <span className={styles.linuxDoLogo} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (isAxchenProvider(provider)) {
    return (
      <svg className={styles.axchenLogo} viewBox="0 0 2000 2000" aria-hidden="true" focusable="false">
        <rect width="2000" height="2000" />
        <polygon points="530.33 1900 100 1900 791.84 100 1222.16 100 530.33 1900" />
        <polygon points="1472.24 1900 1900 1900 1212.29 100 784.53 100 1472.24 1900" />
        <polygon points="1212.29 1900 784.53 1900 1472.24 100 1900 100 1212.29 1900" />
      </svg>
    );
  }

  return <KeyRound size={16} />;
}

function isAxchenProvider(provider: SsoProvider) {
  const providerText = `${provider.provider} ${provider.slug} ${provider.logo ?? ''} ${provider.name}`.toLowerCase();
  return providerText.includes('casdoor') || providerText.includes('axchen');
}
