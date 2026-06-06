import { LoginForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { Alert, Button, Progress, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import { KeyRound, LockKeyhole, UserRound, WalletCards } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import type { AuthFormValues, AuthMode } from '../../types/forms';
import { isCurrencyCode } from '../../utils/budgetTemplate';
import {
  passwordProgressStatus,
  passwordStrengthFor,
  passwordStrengthLabels,
} from '../../utils/password';

interface AuthScreenProps {
  form: FormInstance<AuthFormValues>;
  mode: AuthMode;
  error: string | null;
  isSubmitting: boolean;
  watchedPassword: string | undefined;
  onFinish: (values: AuthFormValues) => Promise<void>;
  onModeChange: (mode: AuthMode) => void;
  onPasskeyLogin: () => Promise<void>;
}

export function AuthScreen({
  form,
  mode,
  error,
  isSubmitting,
  watchedPassword,
  onFinish,
  onModeChange,
  onPasskeyLogin,
}: AuthScreenProps) {
  const passwordStrength = passwordStrengthFor(watchedPassword);
  const passwordProgressPercent = Math.min((watchedPassword?.length ?? 0) * 10, 100);

  return (
    <main className="auth-shell">
      <LoginForm<AuthFormValues>
        className="auth-pro-form"
        form={form}
        logo={
          <div className="auth-pro-logo">
            <WalletCards size={24} />
          </div>
        }
        title="BudgetCentre"
        subTitle="Personal finance workspace"
        contentStyle={{
          minWidth: 280,
          maxWidth: '75vw',
        }}
        initialValues={{ defaultCurrency: 'CNY' }}
        submitter={{
          searchConfig: {
            submitText: mode === 'login' ? 'Login' : 'Create account',
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
          activeKey={mode}
          centered
          items={[
            { key: 'login', label: 'Account login' },
            { key: 'register', label: 'Create account' },
          ]}
          onChange={(key) => onModeChange(key as AuthMode)}
        />

        {error ? <Alert className="auth-error" type="error" showIcon message={error} /> : null}

        {mode === 'register' ? (
          <ProFormText
            name="displayName"
            fieldProps={{
              autoComplete: 'name',
              prefix: <UserRound size={16} />,
              size: 'large',
            }}
            placeholder="Display name"
            rules={[{ required: true, message: 'Display name is required.' }]}
          />
        ) : null}

        <ProFormText
          name="email"
          fieldProps={{
            autoComplete: 'email',
            prefix: <UserRound size={16} />,
            size: 'large',
          }}
          placeholder="Email"
          rules={[
            { required: true, message: 'Email is required.' },
            { type: 'email', message: 'Email format is invalid.' },
          ]}
        />

        <ProFormText.Password
          name="password"
          fieldProps={{
            autoComplete: mode === 'login' ? 'current-password' : 'new-password',
            prefix: <LockKeyhole size={16} />,
            size: 'large',
          }}
          placeholder={mode === 'login' ? 'Password' : 'At least 10 characters, case-sensitive'}
          rules={[
            { required: true, message: 'Password is required.' },
            ...(mode === 'register'
              ? [{ min: 10, message: 'Password must be at least 10 characters.' }]
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
              placeholder="Confirm password"
              rules={[
                { required: true, message: 'Confirm password is required.' },
                ({ getFieldValue }) => ({
                  validator(_, value: unknown) {
                    return value === getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('Passwords do not match.'));
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
              placeholder="Default currency"
              rules={[
                { required: true, message: 'Default currency is required.' },
                {
                  validator: (_, value: unknown) =>
                    typeof value === 'string' && isCurrencyCode(value)
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('Use CNY, HKD, USD, EUR, GBP, JPY, TWD, or MOP.'),
                        ),
                },
              ]}
            />
          </>
        ) : (
          <Button
            block
            className="auth-passkey-button"
            icon={<KeyRound size={16} />}
            loading={isSubmitting}
            size="large"
            onClick={() => void onPasskeyLogin()}
          >
            Continue with passkey
          </Button>
        )}
      </LoginForm>
    </main>
  );
}
