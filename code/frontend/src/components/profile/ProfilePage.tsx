import { useEffect, useState } from 'react';
import { Alert, Button, Flex, Form, Input, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { resendEmailVerification, updatePassword, updateProfile } from '../../api/auth';
import type { OperationsController } from '../../hooks/useOperationsController';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
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
      setProfileNotice(t('profileUpdated'));
    } catch (error: unknown) {
      setProfileError(error instanceof Error ? error.message : t('authFailed'));
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
          ? t('emailSent', { email: nextEmail })
          : t('emailChanged'),
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
      setPasswordNotice(t('passwordUpdated'));
    } catch (error: unknown) {
      setPasswordError(error instanceof Error ? error.message : t('authFailed'));
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
      setProfileNotice(t('emailSent', { email: session.user.email }));
    } catch (error: unknown) {
      setProfileError(error instanceof Error ? error.message : t('authFailed'));
    } finally {
      setIsEmailVerificationSending(false);
    }
  };

  return (
    <div className="profile-page">
      <Flex align="flex-start" justify="space-between" gap="middle" wrap>
        <div>
          <Tag color="blue">{t('profile')}</Tag>
          <Title level={3}>{session.user.displayName}</Title>
          <Text type="secondary">{session.user.email}</Text>
        </div>
        <Space wrap>
          {session.user.emailVerifiedAt === null ? (
            <Tag color="warning">{t('emailPending')}</Tag>
          ) : (
            <Tag color="green">{t('emailVerified')}</Tag>
          )}
          {session.user.isAdmin ? <Tag color="purple">{t('administrator')}</Tag> : null}
        </Space>
      </Flex>

      <Tabs
        items={[
          {
            key: 'details',
            label: t('profile'),
            children: (
              <Flex className="profile-section" vertical gap="middle">
                <Space>
                  <UserRound size={16} />
                  <Text strong>{t('accountDetails')}</Text>
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
                    message={t('emailPending')}
                    description={t('emailVerificationPendingMessage')}
                    action={
                      <Button
                        size="small"
                        loading={isEmailVerificationSending}
                        onClick={handleResendEmailVerification}
                      >
                        {t('emailResend')}
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
                      label={t('nickname')}
                      name="displayName"
                      rules={[
                        { required: true, message: t('displayNameRequired') },
                        { max: 120, message: t('displayNameMax') },
                      ]}
                    >
                      <Input autoComplete="name" prefix={<UserRound size={15} />} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={isProfileSaving}>
                      {t('saveProfile')}
                    </Button>
                  </Form>
                  <div className="profile-email-card">
                    <span>{t('email')}</span>
                    <strong>{session.user.email}</strong>
                    <small>{t('emailChangeNote')}</small>
                    <Button
                      icon={<Mail size={15} />}
                      onClick={() => {
                        emailChangeForm.resetFields();
                        setIsEmailChangeOpen(true);
                      }}
                    >
                      {t('emailChange')}
                    </Button>
                  </div>
                </div>
              </Flex>
            ),
          },
          {
            key: 'security',
            label: t('security'),
            children: (
              <div className="profile-security-grid">
                <Flex className="profile-section" vertical gap="middle">
                  <Space>
                    <ShieldCheck size={16} />
                    <Text strong>{t('passwordHeading')}</Text>
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
                      label={t('currentPassword')}
                      name="currentPassword"
                      rules={[{ required: true, message: t('passwordRequired') }]}
                    >
                      <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item
                      label={t('newPassword')}
                      name="password"
                      rules={[
                        { required: true, message: t('passwordRequired') },
                        { min: 10, message: t('passwordMin') },
                      ]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item
                      dependencies={['password']}
                      label={t('newPasswordConfirm')}
                      name="confirmPassword"
                      rules={[
                        { required: true, message: t('newPasswordConfirm') },
                        ({ getFieldValue }) => ({
                          validator(_, value: string | undefined) {
                            if (!value || getFieldValue('password') === value) {
                              return Promise.resolve();
                            }

                            return Promise.reject(new Error(t('passwordMismatch')));
                          },
                        }),
                      ]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={isPasswordSaving}>
                      {t('updatePassword')}
                    </Button>
                  </Form>
                </Flex>

                <Flex className="profile-section profile-passkey-section" vertical gap="middle">
                  <Space>
                    <KeyRound size={16} />
                    <Text strong>{t('passkey')}</Text>
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
        okText={t('submitChange')}
        open={isEmailChangeOpen}
        title={t('emailChange')}
        onCancel={() => setIsEmailChangeOpen(false)}
        onOk={() => void handleEmailChange()}
      >
        <Alert
          className="modal-error"
          type="warning"
          showIcon
          message={t('emailChangeImpact')}
          description={t('emailChangeDescription')}
        />
        <Form<EmailChangeFormValues>
          form={emailChangeForm}
          layout="vertical"
          name="budget-centre-email-change"
          requiredMark={false}
        >
          <Form.Item
            label={t('newEmail')}
            name="email"
            rules={[
              { required: true, message: t('emailRequired') },
              { type: 'email', message: t('emailValidRequired') },
              {
                validator(_, value: string | undefined) {
                  if (!value || value.trim() !== session.user.email) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error(t('emailAlreadyCurrent')));
                },
              },
            ]}
          >
            <Input autoComplete="email" prefix={<Mail size={15} />} />
          </Form.Item>
          <Form.Item
            dependencies={['email']}
            label={t('confirmNewEmail')}
            name="confirmEmail"
            rules={[
              { required: true, message: t('confirmNewEmail') },
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  if (!value || getFieldValue('email') === value) {
                    return Promise.resolve();
                  }

                  return Promise.reject(new Error(t('emailConfirmMismatch')));
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
