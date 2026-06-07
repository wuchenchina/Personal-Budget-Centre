import { useEffect, useState } from 'react';
import { Button, Result, Spin } from 'antd';
import { verifyEmailToken } from '../../api/auth';

type VerificationState =
  | { status: 'loading' }
  | { status: 'success'; alreadyVerified: boolean }
  | { status: 'error'; message: string };

export function EmailVerificationScreen() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<VerificationState>(() =>
    token === '' ? { status: 'error', message: '验证链接缺少 token。' } : { status: 'loading' },
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
            message: caught instanceof Error ? caught.message : '邮箱验证失败。',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <main className="auth-shell">
      <div className="verification-panel">
        {state.status === 'loading' ? (
          <div className="verification-loading">
            <Spin size="large" />
            <span>正在验证邮箱...</span>
          </div>
        ) : state.status === 'success' ? (
          <Result
            status="success"
            title={state.alreadyVerified ? '邮箱已验证' : '邮箱验证成功'}
            subTitle="现在可以使用 BudgetCentre。"
            extra={
              <Button type="primary" href="/">
                返回登录
              </Button>
            }
          />
        ) : (
          <Result
            status="error"
            title="邮箱验证失败"
            subTitle={state.message}
            extra={
              <Button type="primary" href="/">
                返回登录
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}
