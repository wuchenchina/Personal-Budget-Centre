import { useEffect, useState } from 'react';
import { Alert, Button, Flex, Form, Input, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { resendEmailVerification, updatePassword, updateProfile } from '../../api/auth';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { AuthSession } from '../../types/auth';
import type { EmailChangeFormValues, PasswordFormValues, ProfileFormValues } from '../../types/forms';
import { PasskeySideSection } from '../workspace/PasskeySideSection';

const { Text, Title } = Typography;

interface ProfilePageProps {
  session: AuthSession;
  operations: OperationsController;
  onSessionUpdate: (session: AuthSession) => void;
}

export function ProfilePage({ session, operations, onSessionUpdate }: ProfilePageProps) {
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [emailChangeForm] = Form.useForm<EmailChangeFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isEmailVerificationSending, setIsEmailVerificationSending] = useState(false);
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(false);

  useEffect(() => {
    profileForm.setFieldsValue({
      displayName: session.user.displayName,
    });
  }, [profileForm, session.user.displayName]);

  const handleProfileSave = async (values: ProfileFormValues) => {
    setIsProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const result = await updateProfile({
        displayName: values.displayName.trim(),
        email: session.user.email,
      });

      onSessionUpdate(result.session);
      setProfileNotice('个人资料已更新。');
    } catch (error: unknown) {
      setProfileError(error instanceof Error ? error.message : '更新个人资料失败。');
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleEmailChange = async () => {
    setIsProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const values = await emailChangeForm.validateFields();
      const nextEmail = values.email.trim();
      const result = await updateProfile({
        displayName: session.user.displayName,
        email: nextEmail,
      });

      onSessionUpdate(result.session);
      setProfileNotice(
        result.emailVerificationSent
          ? `新的验证邮件已发送至 ${nextEmail}。`
          : '电子邮件已更新。',
      );
      setIsEmailChangeOpen(false);
      emailChangeForm.resetFields();
    } catch (error: unknown) {
      if (error instanceof Error) {
        setProfileError(error.message);
      }
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handlePasswordSave = async (values: PasswordFormValues) => {
    setIsPasswordSaving(true);
    setPasswordError(null);
    setPasswordNotice(null);

    try {
      await updatePassword({
        currentPassword: values.currentPassword,
        password: values.password,
      });
      passwordForm.resetFields();
      setPasswordNotice('密码已更新。');
    } catch (error: unknown) {
      setPasswordError(error instanceof Error ? error.message : '更新密码失败。');
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleResendEmailVerification = async () => {
    setIsEmailVerificationSending(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      await resendEmailVerification(session.user.email);
      setProfileNotice(`验证邮件已发送至 ${session.user.email}。`);
    } catch (error: unknown) {
      setProfileError(error instanceof Error ? error.message : '发送验证邮件失败。');
    } finally {
      setIsEmailVerificationSending(false);
    }
  };

  return (
    <div className="profile-page">
      <Flex align="flex-start" justify="space-between" gap="middle" wrap>
        <div>
          <Tag color="blue">Profile</Tag>
          <Title level={3}>{session.user.displayName}</Title>
          <Text type="secondary">{session.user.email}</Text>
        </div>
        <Space wrap>
          {session.user.emailVerifiedAt === null ? (
            <Tag color="warning">邮箱待验证</Tag>
          ) : (
            <Tag color="green">邮箱已验证</Tag>
          )}
          {session.user.isAdmin ? <Tag color="purple">管理员</Tag> : null}
        </Space>
      </Flex>

      <Tabs
        items={[
          {
            key: 'details',
            label: '个人资料',
            children: (
              <Flex className="profile-section" vertical gap="middle">
                <Space>
                  <UserRound size={16} />
                  <Text strong>账号资料</Text>
                </Space>
                {profileError ? (
                  <Alert className="side-alert" type="error" showIcon message={profileError} />
                ) : null}
                {profileNotice ? (
                  <Alert className="side-alert" type="success" showIcon message={profileNotice} />
                ) : null}
                {session.user.emailVerifiedAt === null ? (
                  <Alert
                    className="side-alert"
                    type="warning"
                    showIcon
                    message="电子邮件尚未验证"
                    description="修改电子邮件后，需要通过验证信确认新的地址。"
                    action={
                      <Button
                        size="small"
                        loading={isEmailVerificationSending}
                        onClick={handleResendEmailVerification}
                      >
                        重新发送验证信
                      </Button>
                    }
                  />
                ) : null}
                <div className="profile-account-panel">
                  <Form<ProfileFormValues>
                    form={profileForm}
                    layout="vertical"
                    name="budget-centre-profile"
                    requiredMark={false}
                    onFinish={handleProfileSave}
                  >
                    <Form.Item
                      label="昵称"
                      name="displayName"
                      rules={[
                        { required: true, message: '请输入昵称。' },
                        { max: 120, message: '昵称不能超过 120 个字符。' },
                      ]}
                    >
                      <Input autoComplete="name" prefix={<UserRound size={15} />} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={isProfileSaving}>
                      保存资料
                    </Button>
                  </Form>
                  <div className="profile-email-card">
                    <span>电子邮件</span>
                    <strong>{session.user.email}</strong>
                    <small>
                      更改电子邮件后需要重新验证；验证完成前，系统会把它视为待验证地址。
                    </small>
                    <Button
                      icon={<Mail size={15} />}
                      onClick={() => {
                        emailChangeForm.resetFields();
                        setIsEmailChangeOpen(true);
                      }}
                    >
                      更改电子邮件
                    </Button>
                  </div>
                </div>
              </Flex>
            ),
          },
          {
            key: 'security',
            label: '安全',
            children: (
              <div className="profile-security-grid">
                <Flex className="profile-section" vertical gap="middle">
                  <Space>
                    <ShieldCheck size={16} />
                    <Text strong>密码</Text>
                  </Space>
                  {passwordError ? (
                    <Alert className="side-alert" type="error" showIcon message={passwordError} />
                  ) : null}
                  {passwordNotice ? (
                    <Alert className="side-alert" type="success" showIcon message={passwordNotice} />
                  ) : null}
                  <Form<PasswordFormValues>
                    form={passwordForm}
                    layout="vertical"
                    name="budget-centre-password"
                    requiredMark={false}
                    onFinish={handlePasswordSave}
                  >
                    <Form.Item
                      label="当前密码"
                      name="currentPassword"
                      rules={[{ required: true, message: '请输入当前密码。' }]}
                    >
                      <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item
                      label="新密码"
                      name="password"
                      rules={[
                        { required: true, message: '请输入新密码。' },
                        { min: 10, message: '密码至少需要 10 个字符。' },
                      ]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item
                      dependencies={['password']}
                      label="确认新密码"
                      name="confirmPassword"
                      rules={[
                        { required: true, message: '请再次输入新密码。' },
                        ({ getFieldValue }) => ({
                          validator(_, value: string | undefined) {
                            if (!value || getFieldValue('password') === value) {
                              return Promise.resolve();
                            }

                            return Promise.reject(new Error('两次输入的密码不一致。'));
                          },
                        }),
                      ]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={isPasswordSaving}>
                      更新密码
                    </Button>
                  </Form>
                </Flex>

                <Flex className="profile-section profile-passkey-section" vertical gap="middle">
                  <Space>
                    <KeyRound size={16} />
                    <Text strong>通行密钥</Text>
                  </Space>
                  {operations.operationsError ? (
                    <Alert
                      className="side-alert"
                      type="error"
                      showIcon
                      message={operations.operationsError}
                    />
                  ) : null}
                  <PasskeySideSection operations={operations} compactTitle />
                </Flex>
              </div>
            ),
          },
        ]}
      />
      <Modal
        destroyOnClose
        confirmLoading={isProfileSaving}
        okText="提交更改"
        open={isEmailChangeOpen}
        title="更改电子邮件"
        onCancel={() => setIsEmailChangeOpen(false)}
        onOk={() => void handleEmailChange()}
      >
        <Alert
          className="modal-error"
          type="warning"
          showIcon
          message="这会影响登录和通知地址"
          description="提交后系统会发送验证邮件。完成验证前，请不要把这个地址视为已确认。"
        />
        <Form<EmailChangeFormValues>
          form={emailChangeForm}
          layout="vertical"
          name="budget-centre-email-change"
          requiredMark={false}
        >
          <Form.Item
            label="新的电子邮件"
            name="email"
            rules={[
              { required: true, message: '请输入新的电子邮件。' },
              { type: 'email', message: '请输入有效的电子邮件。' },
              {
                validator(_, value: string | undefined) {
                  if (!value || value.trim() !== session.user.email) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error('新的电子邮件不能与当前电子邮件相同。'));
                },
              },
            ]}
          >
            <Input autoComplete="email" prefix={<Mail size={15} />} />
          </Form.Item>
          <Form.Item
            dependencies={['email']}
            label="再次输入新的电子邮件"
            name="confirmEmail"
            rules={[
              { required: true, message: '请再次输入新的电子邮件。' },
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  if (!value || getFieldValue('email') === value) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error('两次输入的电子邮件不一致。'));
                },
              }),
            ]}
          >
            <Input autoComplete="email" prefix={<Mail size={15} />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
