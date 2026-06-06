import { LoginForm, ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { Alert, Button, Divider, Progress, Tabs } from 'antd';
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
  notice: string | null;
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
  notice,
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
        subTitle="个人财务工作区"
        contentStyle={{
          minWidth: 280,
          maxWidth: '75vw',
        }}
        initialValues={{ defaultCurrency: 'CNY' }}
        submitter={{
          searchConfig: {
            submitText: mode === 'login' ? '登录' : '创建账户',
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
            { key: 'login', label: '账户登录' },
            { key: 'register', label: '创建账户' },
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
              使用通行密钥继续
            </Button>
            <Divider className="auth-login-divider" plain>
              账号密码登录
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
              placeholder="用户名"
              rules={[
                { required: true, message: '请输入用户名。' },
                {
                  pattern: /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/,
                  message: '用户名为 3-32 个字符，可使用字母、数字、点、横线或下划线。',
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
              placeholder="显示名称"
              rules={[{ required: true, message: '请输入显示名称。' }]}
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
          placeholder={mode === 'login' ? '用户名或邮箱' : '邮箱'}
          rules={[
            { required: true, message: mode === 'login' ? '请输入用户名或邮箱。' : '请输入邮箱。' },
            ...(mode === 'register' ? [{ type: 'email' as const, message: '邮箱格式不正确。' }] : []),
          ]}
        />

        <ProFormText.Password
          name="password"
          fieldProps={{
            autoComplete: mode === 'login' ? 'current-password' : 'new-password',
            prefix: <LockKeyhole size={16} />,
            size: 'large',
          }}
          placeholder={mode === 'login' ? '密码' : '至少 10 个字符，区分大小写'}
          rules={[
            { required: true, message: '请输入密码。' },
            ...(mode === 'register'
              ? [{ min: 10, message: '密码至少需要 10 个字符。' }]
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
              placeholder="确认密码"
              rules={[
                { required: true, message: '请再次输入密码。' },
                ({ getFieldValue }) => ({
                  validator(_, value: unknown) {
                    return value === getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次输入的密码不一致。'));
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
              placeholder="默认货币"
              rules={[
                { required: true, message: '请选择默认货币。' },
                {
                  validator: (_, value: unknown) =>
                    typeof value === 'string' && isCurrencyCode(value)
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('请使用 CNY、HKD、USD、EUR、GBP、JPY、TWD 或 MOP。'),
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
