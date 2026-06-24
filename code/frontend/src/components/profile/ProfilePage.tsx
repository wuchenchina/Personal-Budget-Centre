import { useEffect, useState, type CSSProperties } from 'react';
import { Alert, Avatar, Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { FileText, KeyRound, Link2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import {
  beginSsoMerge,
  getSsoBinding,
  logout,
  resendEmailVerification,
  unlinkSsoBinding,
  updatePassword,
  updateProfile,
} from '../../api/auth';
import { startCasdoorSignin } from '../../config/casdoor';
import { setPendingSsoMergeToken } from '../../config/ssoMerge';
import { normalizePdfTheme, pdfThemeOptions } from '../../config/pdfThemes';
import type { OperationsController } from '../../hooks/useOperationsController';
import { languageOptions, useI18n } from '../../i18n';
import type { I18nKey } from '../../i18n';
import type { AuthSession, SsoBinding } from '../../types/auth';
import type { BudgetSignatureLabelMode } from '../../types/budget';
import type { EmailChangeFormValues, PasswordFormValues, ProfileFormValues } from '../../types/forms';
import { normalizePdfExportSettings, normalizePdfLanguages, normalizeSignatureLabelMode } from '../../utils/pdfExportSettings';
import { currencySearchLabel, renderCurrencyOption } from '../../utils/currencyOptions';
import { PasskeySideSection } from '../workspace/PasskeySideSection';
import styles from './ProfilePage.module.css';

const { Text, Title } = Typography;
const bochkProfileCurrencyCodes = new Set([
  'AUD',
  'BND',
  'CAD',
  'CHF',
  'CNH',
  'CNY',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'JPY',
  'NOK',
  'NZD',
  'SEK',
  'SGD',
  'THB',
  'USD',
  'ZAR',
]);

interface ProfilePageProps {
  session: AuthSession;
  operations: OperationsController;
  onSessionUpdate: (session: AuthSession) => void;
}

export function ProfilePage({ session, operations, onSessionUpdate }: ProfilePageProps) {
  const { t } = useI18n();
  const [accountForm] = Form.useForm<ProfileFormValues>();
  const [exportForm] = Form.useForm<ProfileFormValues>();
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
  const [ssoBinding, setSsoBinding] = useState<SsoBinding | null>(null);
  const [isSsoLoading, setIsSsoLoading] = useState(true);
  const [isSsoUnlinking, setIsSsoUnlinking] = useState(false);
  const [isSsoMergeStarting, setIsSsoMergeStarting] = useState(false);
  const isSsoOnlyAccount = !session.user.hasPassword;
  const watchedPdfTheme = Form.useWatch('defaultPdfTheme', exportForm);
  const watchedShowWorkspace = Form.useWatch(['pdfExportSettings', 'showWorkspace'], exportForm);
  const watchedPdfLanguages = Form.useWatch(['pdfExportSettings', 'pdfLanguages'], exportForm);
  const watchedSignatureLabelMode = Form.useWatch(['pdfExportSettings', 'signatureLabelMode'], exportForm);
  const watchedSignatureLabelLanguages = Form.useWatch(['pdfExportSettings', 'signatureLabelLanguages'], exportForm);
  const previewPdfTheme = normalizePdfTheme(watchedPdfTheme ?? session.user.defaultPdfTheme);
  const previewSettings = normalizePdfExportSettings(session.user.pdfExportSettings);
  const previewShowWorkspace =
    watchedShowWorkspace ?? previewSettings.showWorkspace;
  const previewPdfLanguages = normalizePdfExportSettings({
    ...previewSettings,
    pdfLanguages: watchedPdfLanguages ?? previewSettings.pdfLanguages,
  }).pdfLanguages;
  const previewSignatureLabelMode = normalizeSignatureLabelMode(
    watchedSignatureLabelMode ?? previewSettings.signatureLabelMode,
  );
  const previewSignatureLabelLanguages = normalizePdfLanguages(
    watchedSignatureLabelLanguages ?? previewSettings.signatureLabelLanguages,
  );
  const previewWorkspaceName = session.workspace?.name ?? t('noWorkspaceSelected');
  const profileCurrencyOptions = operations.currencyPresets
    .filter((currency) => bochkProfileCurrencyCodes.has(currency.code))
    .map((currency) => ({
      label: currencySearchLabel(currency),
      value: currency.code,
      currency,
    }));
  useEffect(() => {
    const profileValues = {
      defaultCurrency: session.user.defaultCurrency,
      defaultPdfTheme: normalizePdfTheme(session.user.defaultPdfTheme),
      displayName: session.user.displayName,
      pdfExportSettings: normalizePdfExportSettings(session.user.pdfExportSettings),
    };

    accountForm.setFieldsValue(profileValues);
    exportForm.setFieldsValue(profileValues);
  }, [
    accountForm,
    exportForm,
    session.user.defaultCurrency,
    session.user.defaultPdfTheme,
    session.user.displayName,
    session.user.pdfExportSettings,
  ]);

  useEffect(() => {
    let isMounted = true;

    getSsoBinding()
      .then((result) => {
        if (isMounted) {
          setSsoBinding(result.binding);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          void message.error(error instanceof Error ? error.message : t('authFailed'));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSsoLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [t]);

  const handleProfileSave = async (values: ProfileFormValues, includeDefaultCurrency = false) => {
    setIsProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const result = await updateProfile({
        ...(includeDefaultCurrency ? { defaultCurrency: values.defaultCurrency ?? null } : {}),
        defaultPdfTheme: normalizePdfTheme(values.defaultPdfTheme),
        displayName: values.displayName.trim(),
        email: session.user.email,
        pdfExportSettings: normalizePdfExportSettings(values.pdfExportSettings ?? session.user.pdfExportSettings),
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
        defaultCurrency: session.user.defaultCurrency,
        defaultPdfTheme: session.user.defaultPdfTheme,
        displayName: session.user.displayName,
        email: nextEmail,
        pdfExportSettings: normalizePdfExportSettings(session.user.pdfExportSettings),
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

  const handleSsoMergeStart = async () => {
    setIsSsoMergeStarting(true);

    try {
      const result = await beginSsoMerge();
      setPendingSsoMergeToken(result.mergeToken);
      await logout();
      void message.info(t('ssoMergeLoginPrompt'));
      window.location.replace('/');
    } catch (error: unknown) {
      void message.error(error instanceof Error ? error.message : t('authFailed'));
    } finally {
      setIsSsoMergeStarting(false);
    }
  };

  const handleSsoBind = () => {
    startCasdoorSignin('bind');
  };

  const handleSsoUnlink = () => {
    Modal.confirm({
      title: t('axchenSsoUnlinkTitle'),
      content: t('axchenSsoUnlinkConfirm'),
      okText: t('axchenSsoUnlink'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: async () => {
        setIsSsoUnlinking(true);

        try {
          const result = await unlinkSsoBinding();
          setSsoBinding(result.binding);
          void message.success(t('axchenSsoUnlinked'));
        } catch (error: unknown) {
          void message.error(error instanceof Error ? error.message : t('authFailed'));
        } finally {
          setIsSsoUnlinking(false);
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.workbench}>
        <section className={styles.profileSummary}>
          <div className={styles.summaryIdentity}>
            <Avatar
              alt={session.user.displayName}
              className={styles.avatar}
              size={72}
              src={session.user.avatarUrl ?? undefined}
            >
              {getProfileInitial(session.user.displayName, session.user.email)}
            </Avatar>
            <div className={styles.summaryCopy}>
              <div className={styles.summaryTopline}>
                <Text className={styles.eyebrow}>{t('profile')}</Text>
                <Space className={styles.statusRow} size={[6, 6]} wrap>
                  {session.user.emailVerifiedAt === null ? (
                    <Tag color="warning">{t('emailPending')}</Tag>
                  ) : (
                    <Tag color="green">{t('emailVerified')}</Tag>
                  )}
                  {session.user.isAdmin ? <Tag color="red">{t('administrator')}</Tag> : null}
                </Space>
              </div>
              <Title className={styles.title} level={2}>
                {session.user.displayName}
              </Title>
              <span className={styles.emailLine}>
                <Mail size={15} />
                <Text type="secondary">{session.user.email}</Text>
              </span>
            </div>
          </div>
        </section>

        <main className={styles.contentPanel}>
          <Tabs
            className={styles.tabs}
            size="large"
            items={[
              {
                key: 'account',
                label: (
                  <span className={styles.tabLabel}>
                    <UserRound size={15} />
                    {t('profileTabAccount')}
                  </span>
                ),
                children: (
                  <div className={`${styles.tabContent} ${styles.exportLayout}`}>
                    {profileError ? (
                      <Alert className={styles.sideAlert} type="error" showIcon message={profileError} />
                    ) : null}
                    {profileNotice ? (
                      <Alert className={styles.sideAlert} type="success" showIcon message={profileNotice} />
                    ) : null}
                    {session.user.emailVerifiedAt === null ? (
                      <Alert
                        className={styles.sideAlert}
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
                    <section className={styles.settingSection}>
                      <div className={styles.panelHeader}>
                        <span className={styles.panelIcon}>
                          <UserRound size={16} />
                        </span>
                        <div>
                          <Text strong>{t('accountDetails')}</Text>
                          <Text type="secondary">{t('nickname')}</Text>
                        </div>
                      </div>
                      <Form<ProfileFormValues>
                        form={accountForm}
                        className={styles.form}
                        layout="vertical"
                        name="budget-centre-profile"
                        requiredMark={false}
                        onFinish={(values) => void handleProfileSave(values, true)}
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
                        <Form.Item hidden name="defaultPdfTheme">
                          <Input />
                        </Form.Item>
                        <Form.Item
                          label={t('primaryCurrency')}
                          name="defaultCurrency"
                          extra={t('primaryCurrencyHelp')}
                        >
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            optionRender={renderCurrencyOption}
                            options={profileCurrencyOptions}
                            placeholder={t('defaultCurrencyPlaceholder')}
                          />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" loading={isProfileSaving}>
                          {t('saveProfile')}
                        </Button>
                      </Form>
                    </section>

                    <section className={styles.settingSection}>
                      <div className={styles.panelHeader}>
                        <span className={styles.panelIcon}>
                          <Mail size={16} />
                        </span>
                        <div>
                          <Text strong>{t('email')}</Text>
                          <Text type="secondary">
                            {session.user.emailVerifiedAt === null
                              ? t('emailPending')
                              : t('emailVerified')}
                          </Text>
                        </div>
                      </div>
                      <div className={styles.readonlyValue}>
                        <strong>{session.user.email}</strong>
                        <small>{t('emailChangeNote')}</small>
                      </div>
                      {session.user.hasPassword ? (
                        <Button
                          className={styles.fullWidthAction}
                          icon={<Mail size={15} />}
                          onClick={() => {
                            emailChangeForm.resetFields();
                            setIsEmailChangeOpen(true);
                          }}
                        >
                          {t('emailChange')}
                        </Button>
                      ) : null}
                    </section>
                  </div>
                ),
              },
              {
                key: 'export',
                label: (
                  <span className={styles.tabLabel}>
                    <FileText size={15} />
                    {t('profileTabExport')}
                  </span>
                ),
                children: (
                  <div className={`${styles.tabContent} ${styles.exportTabContent}`}>
                    {profileError ? (
                      <Alert className={styles.sideAlert} type="error" showIcon message={profileError} />
                    ) : null}
                    {profileNotice ? (
                      <Alert className={styles.sideAlert} type="success" showIcon message={profileNotice} />
                    ) : null}
                    <section className={styles.exportWorkbench}>
                      <Form<ProfileFormValues>
                        form={exportForm}
                        className={`${styles.form} ${styles.exportForm}`}
                        layout="vertical"
                        name="budget-centre-export"
                        requiredMark={false}
                        onFinish={(values) => void handleProfileSave(values)}
                      >
                        <div className={styles.exportConfig}>
                          <div className={styles.panelHeader}>
                            <span className={styles.panelIcon}>
                              <FileText size={16} />
                            </span>
                            <div>
                              <Text strong>{t('pdfTheme')}</Text>
                              <Text type="secondary">{t('pdfThemeProfileHelp')}</Text>
                            </div>
                          </div>
                          <Form.Item
                            label={t('pdfTheme')}
                            name="defaultPdfTheme"
                            rules={[{ required: true, message: t('pdfThemeRequired') }]}
                          >
                            <Radio.Group
                              className={styles.themeRadioGroup}
                              options={pdfThemeOptions.map((theme) => ({
                                label: (
                                  <span className={styles.themeOption}>
                                    <span className={styles.themePreviewInline}>
                                      <span
                                        className={styles.themeSwatch}
                                        style={
                                          {
                                            '--theme-swatch': theme.swatch,
                                            '--theme-accent': theme.accent,
                                          } as CSSProperties
                                        }
                                      />
                                      <span className={styles.themeMiniRows}>
                                        <span />
                                        <span />
                                        <span />
                                      </span>
                                    </span>
                                    <span className={styles.themeOptionCopy}>
                                      <strong>{t(pdfThemeLabelKey(theme.key))}</strong>
                                      <small>{t(pdfThemeDescriptionKey(theme.key))}</small>
                                    </span>
                                  </span>
                                ),
                                value: theme.key,
                              }))}
                              onChange={(event: RadioChangeEvent) => {
                                exportForm.setFieldValue('defaultPdfTheme', normalizePdfTheme(event.target.value));
                              }}
                            />
                          </Form.Item>
                          <Form.Item hidden name="displayName">
                            <Input />
                          </Form.Item>
                          <div className={styles.exportOptionGrid}>
                            <Form.Item
                              className={styles.languageField}
                              label={t('pdfExportLanguages')}
                              name={['pdfExportSettings', 'pdfLanguages']}
                              rules={[
                                {
                                  validator: async (_, value: unknown) => {
                                    if (Array.isArray(value) && value.length > 0) {
                                      return;
                                    }

                                    throw new Error(t('pdfExportLanguageRequired'));
                                  },
                                },
                              ]}
                            >
                              <Checkbox.Group
                                className={styles.languageCheckboxes}
                                options={languageOptions}
                              />
                            </Form.Item>
                            <Form.Item
                              className={styles.switchField}
                              name={['pdfExportSettings', 'showWorkspace']}
                              valuePropName="checked"
                            >
                              <SwitchSetting
                                title={t('pdfExportShowWorkspace')}
                                description={t('pdfExportShowWorkspaceDescription')}
                              />
                            </Form.Item>
                            <Form.Item
                              className={styles.languageField}
                              extra={t('pdfExportSignatureLabelModeDescription')}
                              label={t('pdfExportSignatureLabelMode')}
                              name={['pdfExportSettings', 'signatureLabelMode']}
                              rules={[{ required: true, message: t('pdfExportSignatureLabelModeRequired') }]}
                            >
                              <Radio.Group
                                options={signatureLabelModeOptions(t)}
                                onChange={(event: RadioChangeEvent) => {
                                  exportForm.setFieldValue(
                                    ['pdfExportSettings', 'signatureLabelMode'],
                                    normalizeSignatureLabelMode(event.target.value),
                                  );
                                }}
                              />
                            </Form.Item>
                            <Form.Item
                              className={styles.languageField}
                              extra={t('pdfExportSignatureLabelLanguagesDescription')}
                              label={t('pdfExportSignatureLabelLanguages')}
                              name={['pdfExportSettings', 'signatureLabelLanguages']}
                              rules={[
                                {
                                  validator: async (_, value: unknown) => {
                                    if (Array.isArray(value) && value.length > 0) {
                                      return;
                                    }

                                    throw new Error(t('pdfExportSignatureLabelLanguageRequired'));
                                  },
                                },
                              ]}
                            >
                              <Checkbox.Group
                                className={styles.languageCheckboxes}
                                options={languageOptions}
                              />
                            </Form.Item>
                          </div>
                          <Button type="primary" htmlType="submit" loading={isProfileSaving}>
                            {t('saveProfile')}
                          </Button>
                        </div>
                      </Form>
                      <section className={styles.exportPreview} aria-label={t('pdfExportPreview')}>
                        <div className={styles.previewToolbar}>
                          <span>{t('pdfExportPreview')}</span>
                          <Space size={6} wrap>
                            <Tag color={pdfThemeTagColor(previewPdfTheme)}>
                              {t(pdfThemeLabelKey(previewPdfTheme))}
                            </Tag>
                            {previewPdfLanguages.map((pdfLanguage) => (
                              <Tag key={pdfLanguage}>{languageOptions.find((option) => option.value === pdfLanguage)?.label ?? pdfLanguage}</Tag>
                            ))}
                            <Tag color="geekblue">{t(signatureLabelModeKey(previewSignatureLabelMode))}</Tag>
                            {previewSignatureLabelLanguages.map((signatureLanguage) => (
                              <Tag key={`signature-${signatureLanguage}`} color="cyan">
                                {languageOptions.find((option) => option.value === signatureLanguage)?.label ?? signatureLanguage}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                        <div
                          className={`${styles.previewSheet} ${pdfThemePreviewClass(previewPdfTheme)}`}
                        >
                          <div className={styles.previewTop}>
                            <div className={styles.previewTitle}>
                              <span>{t('pdfExportPreviewTitle')}</span>
                              <small>{t('pdfExportPreviewSubtitle')}</small>
                            </div>
                            <div className={styles.previewMeta}>
                              <span>
                                <b>Page / 頁</b>
                                <em>1</em>
                              </span>
                              <span>
                                <b>Date / 日期</b>
                                <em>20 Jun 2026</em>
                              </span>
                              {previewShowWorkspace ? (
                                <span>
                                  <b>Workspace / 工作區</b>
                                  <em>{previewWorkspaceName}</em>
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.previewBand}>{t('pdfExportPreviewSection')}</div>
                          <div className={styles.previewRows}>
                            <span />
                            <span />
                            <span />
                          </div>
                          <div className={styles.previewSignature} />
                        </div>
                      </section>
                    </section>
                  </div>
                ),
              },
              {
                key: 'loginSecurity',
                label: (
                  <span className={styles.tabLabel}>
                    <ShieldCheck size={15} />
                    {t('profileTabLoginSecurity')}
                  </span>
                ),
                children: (
                  <div className={styles.securityGrid}>
                    <section className={styles.settingSection}>
                      <div className={styles.panelHeader}>
                        <span className={styles.panelIcon}>
                          <ShieldCheck size={16} />
                        </span>
                        <div>
                          <Text strong>{t('passwordHeading')}</Text>
                          <Text type="secondary">{t('newPassword')}</Text>
                        </div>
                      </div>
                      {passwordError ? (
                        <Alert className={styles.sideAlert} type="error" showIcon message={passwordError} />
                      ) : null}
                      {passwordNotice ? (
                        <Alert className={styles.sideAlert} type="success" showIcon message={passwordNotice} />
                      ) : null}
                      <Form<PasswordFormValues>
                        form={passwordForm}
                        className={styles.form}
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
                    </section>

                    <section className={`${styles.settingSection} ${styles.passkeySection}`}>
                      <div className={styles.panelHeader}>
                        <span className={styles.panelIcon}>
                          <KeyRound size={16} />
                        </span>
                        <div>
                          <Text strong>{t('passkey')}</Text>
                          <Text type="secondary">{t('deviceName')}</Text>
                        </div>
                      </div>
                      {operations.operationsError ? (
                        <Alert
                          className={styles.sideAlert}
                          type="error"
                          showIcon
                          message={operations.operationsError}
                        />
                      ) : null}
                      <PasskeySideSection operations={operations} compactTitle />
                    </section>
                  </div>
                ),
              },
              {
                key: 'linkedAccounts',
                label: (
                  <span className={styles.tabLabel}>
                    <Link2 size={15} />
                    {t('profileTabLinkedAccounts')}
                  </span>
                ),
                children: (
                  <div className={styles.tabContent}>
                    <section className={styles.settingSection}>
                      <div className={styles.panelHeader}>
                        <span className={styles.panelIcon}>
                          <ShieldCheck size={16} />
                        </span>
                        <div>
                          <Text strong>{t('axchenSso')}</Text>
                          <Text type="secondary">
                            {ssoBinding === null ? t('axchenSsoNotLinked') : t('axchenSsoLinked')}
                          </Text>
                        </div>
                      </div>
                      {ssoBinding === null ? (
                        session.user.hasPassword ? (
                          <Button className={styles.outlineAction} loading={isSsoLoading} onClick={handleSsoBind}>
                            {t('axchenSsoBind')}
                          </Button>
                        ) : (
                          <Alert
                            className={styles.sideAlert}
                            type="info"
                            showIcon
                            message={t('ssoOnlyAccount')}
                            description={t('ssoOnlyBindExistingDescription')}
                            action={
                              <Button
                                size="small"
                                type="primary"
                                loading={isSsoMergeStarting}
                                onClick={() => void handleSsoMergeStart()}
                              >
                                {t('ssoBindExistingAccount')}
                              </Button>
                            }
                          />
                        )
                      ) : (
                        <>
                          <div className={styles.readonlyValue}>
                            <strong>{ssoBinding.username ?? ssoBinding.email ?? ssoBinding.subject}</strong>
                            <small>{ssoBinding.email ?? t('axchenSsoBoundFallback')}</small>
                          </div>
                          <div className={styles.ssoActions}>
                            <Tag color="green">{t('axchenSsoBound')}</Tag>
                            {session.user.hasPassword ? (
                              <Button
                                danger
                                className={styles.dangerOutlineAction}
                                loading={isSsoUnlinking}
                                onClick={handleSsoUnlink}
                              >
                                {t('axchenSsoUnlink')}
                              </Button>
                            ) : (
                              <Button
                                className={styles.outlineAction}
                                loading={isSsoMergeStarting}
                                onClick={() => void handleSsoMergeStart()}
                              >
                                {t('ssoBindExistingAccount')}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  </div>
                ),
              },
            ].filter((item) => item.key !== 'loginSecurity' || !isSsoOnlyAccount)}
          />
        </main>
      </div>
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
          className={styles.modalAlert}
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

function pdfThemeTagColor(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'hsbc':
      return 'red';
    case 'uswds':
      return 'blue';
    default:
      return 'default';
  }
}

function pdfThemePreviewClass(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'hsbc':
      return styles.previewStatement;
    case 'uswds':
      return styles.previewUswds;
    default:
      return styles.previewClassic;
  }
}

function pdfThemeLabelKey(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'hsbc':
      return 'pdfThemeHsbc';
    case 'uswds':
      return 'pdfThemeUswds';
    default:
      return 'pdfThemeClassic';
  }
}

function pdfThemeDescriptionKey(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'hsbc':
      return 'pdfThemeHsbcDescription';
    case 'uswds':
      return 'pdfThemeUswdsDescription';
    default:
      return 'pdfThemeClassicDescription';
  }
}

function signatureLabelModeOptions(t: (key: I18nKey) => string) {
  return [
    { label: t('confirmationSignature'), value: 'confirmation_signature' },
    { label: t('confirmationOnly'), value: 'confirmation' },
    { label: t('signatureOnly'), value: 'signature' },
  ] satisfies Array<{ label: string; value: BudgetSignatureLabelMode }>;
}

function signatureLabelModeKey(mode: BudgetSignatureLabelMode) {
  switch (mode) {
    case 'confirmation':
      return 'confirmationOnly';
    case 'signature':
      return 'signatureOnly';
    default:
      return 'confirmationSignature';
  }
}

interface SwitchSettingProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  title: string;
  description: string;
}

function SwitchSetting({ checked = false, onChange, title, description }: SwitchSettingProps) {
  return (
    <div className={styles.switchSetting}>
      <span className={styles.switchCopy}>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Switch checked={checked} onChange={onChange} size="small" />
    </div>
  );
}

function getProfileInitial(displayName: string, email: string): string {
  const source = displayName.trim() || email.trim();
  return Array.from(source)[0]?.toLocaleUpperCase() ?? 'B';
}
