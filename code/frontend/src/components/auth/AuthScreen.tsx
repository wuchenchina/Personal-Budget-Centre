import { LoginForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { Alert, Button, Divider, Progress, Select, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import { KeyRound, LockKeyhole, UserRound, WalletCards } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import type { AppLanguage } from '../../i18n';
import { languageOptions, useI18n } from '../../i18n';
import type { AuthFormValues, AuthMode } from '../../types/forms';
import { isCurrencyCode } from '../../utils/budgetTemplate';
import { passwordProgressStatus, passwordStrengthFor } from '../../utils/password';

interface AuthScreenProps {
  form: FormInstance<AuthFormValues>;
  mode: AuthMode;
  error: string | null;
  notice: string | null;
  isSubmitting: boolean;
  language: AppLanguage;
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

  return (
    <main className="auth-shell">
      <Select<AppLanguage>
        aria-label="Language"
        className="auth-language-switcher"
        options={languageOptions}
        size="small"
        value={language}
        onChange={onLanguageChange}
      />
      <LoginForm<AuthFormValues>
        className="auth-pro-form"
        form={form}
        logo={
          <div className="auth-pro-logo">
            <WalletCards size={24} />
          </div>
        }
        title="BudgetCentre"
        subTitle={t('loginSubtitle')}
        contentStyle={{
          minWidth: 280,
          maxWidth: '75vw',
        }}
        initialValues={{ defaultCurrency: 'CNY' }}
        submitter={{
          searchConfig: {
            submitText: mode === 'login' ? t('login') : t('createAccount'),
          },
          submitButtonProps: {
            loading: isSubmitting,
            size: 'large',
          },
        }}
        onFinish={async (values) => {
          await onFinish(values);

          return true;
        }}
      >
        <Tabs
          className="auth-mode-tabs"
          activeKey={mode}
          centered
          items={[
            { key: 'login', label: t('loginTab') },
            { key: 'register', label: t('createAccount') },
          ]}
          onChange={(key) => onModeChange(key as AuthMode)}
        />

        {error ? <Alert className="auth-error" type="error" showIcon message={error} /> : null}
        {notice ? <Alert className="auth-error" type="success" showIcon message={notice} /> : null}

        {mode === 'login' ? (
          <div className="auth-login-methods">
            <Button
              block
              className="auth-passkey-button"
              icon={<KeyRound size={16} />}
              loading={isSubmitting}
              size="large"
              onClick={() => void onPasskeyLogin()}
            >
              {t('loginWithPasskey')}
            </Button>
            <Divider className="auth-login-divider" plain>
              {t('loginWithPassword')}
            </Divider>
          </div>
        ) : null}

        {mode === 'register' ? (
          <>
            <ProFormText
              name="username"
              fieldProps={{
                autoComplete: 'username',
                prefix: <UserRound size={16} />,
                size: 'large',
              }}
              placeholder={t('username')}
              rules={[
                { required: true, message: t('usernameRequired') },
                {
                  pattern: /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/,
                  message: t('usernamePattern'),
                },
              ]}
            />
            <ProFormText
              name="displayName"
              fieldProps={{
                autoComplete: 'name',
                prefix: <UserRound size={16} />,
                size: 'large',
              }}
              placeholder={t('displayName')}
              rules={[{ required: true, message: t('displayNameRequired') }]}
            />
          </>
        ) : null}

        <ProFormText
          name={mode === 'login' ? 'identifier' : 'email'}
          fieldProps={{
            autoComplete: mode === 'login' ? 'username' : 'email',
            prefix: <UserRound size={16} />,
            size: 'large',
          }}
          placeholder={mode === 'login' ? t('usernameOrEmail') : t('email')}
          rules={[
            {
              required: true,
              message: mode === 'login' ? t('usernameOrEmailRequired') : t('emailRequired'),
            },
            ...(mode === 'register'
              ? [{ type: 'email' as const, message: t('emailFormatInvalid') }]
              : []),
          ]}
        />

        <ProFormText.Password
          name="password"
          fieldProps={{
            autoComplete: mode === 'login' ? 'current-password' : 'new-password',
            prefix: <LockKeyhole size={16} />,
            size: 'large',
          }}
          placeholder={mode === 'login' ? t('password') : t('passwordMin')}
          rules={[
            { required: true, message: t('passwordRequired') },
            ...(mode === 'register'
              ? [{ min: 10, message: t('passwordMin') }]
              : []),
          ]}
        />

        {mode === 'register' ? (
          <>
            <div className={`password-strength password-strength-${passwordStrength}`}>
              <span>{passwordStrengthLabels[passwordStrength]}</span>
              <Progress
                percent={passwordProgressPercent}
                showInfo={false}
                size="small"
                status={passwordProgressStatus[passwordStrength]}
              />
            </div>

            <ProFormText.Password
              name="confirmPassword"
              fieldProps={{
                autoComplete: 'new-password',
                prefix: <LockKeyhole size={16} />,
                size: 'large',
              }}
              placeholder={t('confirmPassword')}
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
            />

            <ProFormSelect
              name="defaultCurrency"
              fieldProps={{
                size: 'large',
              }}
              options={currencyOptions}
              placeholder={t('defaultCurrency')}
              rules={[
                { required: true, message: t('selectDefaultCurrency') },
                {
                  validator: (_, value: unknown) =>
                    typeof value === 'string' && isCurrencyCode(value)
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(t('supportedCurrencyOnly')),
                        ),
                },
              ]}
            />
          </>
        ) : null}
      </LoginForm>
    </main>
  );
}
