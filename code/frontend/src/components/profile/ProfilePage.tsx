import { useEffect, useState, type CSSProperties } from 'react';
import { Alert, Avatar, Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { FileText, KeyRound, Link2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import {
  beginSsoMerge,
  getSsoBindings,
  logout,
  resendEmailVerification,
  unlinkSsoBinding,
  updatePassword,
  updateProfile,
} from '../../api/auth';
import { ssoProviderName, startSsoSignin } from '../../config/sso';
import { setPendingSsoMergeToken } from '../../config/ssoMerge';
import { normalizePdfTheme, pdfThemeOptions } from '../../config/pdfThemes';
import type { OperationsController } from '../../hooks/useOperationsController';
import { languageOptions, useI18n } from '../../i18n';
import type { I18nKey } from '../../i18n';
import type { AuthSession, SsoBinding, SsoProvider, SsoProviderID } from '../../types/auth';
import type { BudgetSignatureLabelMode } from '../../types/budget';
import type { EmailChangeFormValues, PasswordFormValues, ProfileFormValues } from '../../types/forms';
import {
  alignPdfChineseLanguages,
  normalizePdfExportSettings,
  normalizePdfLanguages,
  normalizePdfLanguagesForChange,
  normalizeSignatureLabelMode,
} from '../../utils/pdfExportSettings';
import { currencySearchLabel, renderCurrencyOption } from '../../utils/currencyOptions';
import { PasskeySideSection } from '../workspace/PasskeySideSection';
import styles from './ProfilePage.module.css';

const { Text, Title } = Typography;
const bankReferenceProfileCurrencyCodes = new Set([
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
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [ssoBindings, setSsoBindings] = useState<SsoBinding[]>([]);
  const [isSsoLoading, setIsSsoLoading] = useState(true);
  const [ssoUnlinkingProvider, setSsoUnlinkingProvider] = useState<SsoProviderID | null>(null);
  const [ssoMergeStartingProvider, setSsoMergeStartingProvider] = useState<SsoProviderID | null>(null);
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
  const previewSignatureLabelLanguages = alignPdfChineseLanguages(
    previewPdfLanguages,
    normalizePdfLanguages(watchedSignatureLabelLanguages ?? previewSettings.signatureLabelLanguages),
  ).signatureLabelLanguages;
  const previewWorkspaceName = session.workspace?.name ?? t('noWorkspaceSelected');
  const profileCurrencyOptions = operations.currencyPresets
    .filter((currency) => bankReferenceProfileCurrencyCodes.has(currency.code))
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

    getSsoBindings()
      .then((result) => {
        if (isMounted) {
          setSsoBindings(result.bindings);
          setSsoProviders(result.providers ?? []);
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

  const syncExportChineseLanguages = (
    changedValues: Partial<Pick<ProfileFormValues, 'pdfExportSettings'>>,
    values: ProfileFormValues,
  ) => {
    const changedLanguages =
      changedValues.pdfExportSettings?.pdfLanguages
      ?? changedValues.pdfExportSettings?.signatureLabelLanguages;
    if (!changedLanguages) {
      return;
    }

    const alignedLanguages = alignPdfChineseLanguages(
      normalizePdfLanguages(values.pdfExportSettings?.pdfLanguages),
      normalizePdfLanguages(values.pdfExportSettings?.signatureLabelLanguages),
      changedLanguages.find((language) => language === 'sc' || language === 'tc') ?? null,
    );
    const nextExportSettings = {
      ...normalizePdfExportSettings(values.pdfExportSettings),
      ...alignedLanguages,
    };

    exportForm.setFieldsValue({
      pdfExportSettings: nextExportSettings,
    });
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

  const handleSsoMergeStart = async (provider: SsoProviderID) => {
    setSsoMergeStartingProvider(provider);

    try {
      const result = await beginSsoMerge(provider);
      setPendingSsoMergeToken(result.mergeToken);
      await logout();
      void message.info(t('ssoMergeLoginPrompt'));
      window.location.replace('/');
    } catch (error: unknown) {
      void message.error(error instanceof Error ? error.message : t('authFailed'));
    } finally {
      setSsoMergeStartingProvider(null);
    }
  };

  const handleSsoBind = (provider: SsoProvider) => {
    startSsoSignin(provider, 'bind');
  };

  const handleSsoUnlink = (provider: SsoProvider) => {
    Modal.confirm({
      title: `${t('genericSsoUnlinkTitle')} · ${provider.name}`,
      content: t('genericSsoUnlinkConfirm'),
      okText: t('genericSsoUnlink'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: async () => {
        setSsoUnlinkingProvider(provider.provider);

        try {
          const result = await unlinkSsoBinding(provider.provider);
          setSsoBindings(result.bindings);
          void message.success(t('genericSsoUnlinked'));
        } catch (error: unknown) {
          void message.error(error instanceof Error ? error.message : t('authFailed'));
        } finally {
          setSsoUnlinkingProvider(null);
        }
      },
    });
  };

  const ssoProviderRows = providerRows(ssoProviders, ssoBindings);
  const hasLinkedAccountTab = ssoProviderRows.length > 0 || isSsoLoading;

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
                        onValuesChange={syncExportChineseLanguages}
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
                              normalize={normalizePdfLanguagesForChange}
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
                              normalize={normalizePdfLanguagesForChange}
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
                    {ssoProviderRows.map(({ provider, binding }) => (
                      <section className={styles.settingSection} key={provider.provider}>
                        <div className={styles.panelHeader}>
                          <span className={styles.panelIcon}>
                            <SsoProviderLogo provider={provider} />
                          </span>
                          <div>
                            <Text strong>{provider.name}</Text>
                            <Text type="secondary">
                              {binding === null ? t('genericSsoNotLinked') : t('genericSsoLinked')}
                            </Text>
                          </div>
                        </div>
                        {binding === null ? (
                          <Button
                            className={styles.outlineAction}
                            disabled={isSsoLoading}
                            loading={isSsoLoading}
                            onClick={() => handleSsoBind(provider)}
                          >
                            {t('genericSsoBind')} {provider.name}
                          </Button>
                        ) : (
                          <>
                            <div className={styles.readonlyValue}>
                              <strong>{binding.username ?? binding.email ?? binding.subject}</strong>
                              <small>{binding.email ?? `${provider.name} ${t('genericSsoBound')}`}</small>
                            </div>
                            <div className={styles.ssoActions}>
                              <Tag color="green">{t('genericSsoBound')}</Tag>
                              {session.user.hasPassword ? (
                                <Button
                                  danger
                                  className={styles.dangerOutlineAction}
                                  loading={ssoUnlinkingProvider === provider.provider}
                                  onClick={() => handleSsoUnlink(provider)}
                                >
                                  {t('genericSsoUnlink')}
                                </Button>
                              ) : (
                                <Button
                                  className={styles.outlineAction}
                                  loading={ssoMergeStartingProvider === provider.provider}
                                  onClick={() => void handleSsoMergeStart(provider.provider)}
                                >
                                  {t('ssoBindExistingAccount')}
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                    ))}
                  </div>
                ),
              },
            ].filter((item) => (item.key !== 'loginSecurity' || !isSsoOnlyAccount) && (item.key !== 'linkedAccounts' || hasLinkedAccountTab))}
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
    case 'statement_red':
      return 'red';
    case 'civic_blue':
      return 'blue';
    default:
      return 'default';
  }
}

function providerRows(providers: SsoProvider[], bindings: SsoBinding[]) {
  const byProvider = new Map<SsoProviderID, SsoProvider>();
  providers.forEach((provider) => {
    byProvider.set(provider.provider, provider);
  });
  bindings.forEach((binding) => {
    if (!byProvider.has(binding.provider)) {
      byProvider.set(binding.provider, {
        provider: binding.provider,
        slug: String(binding.provider).replaceAll('_', '-'),
        name: ssoProviderName(undefined, binding.provider),
        logo: binding.provider === 'linux_do' ? 'linux_do' : null,
      });
    }
  });

  return Array.from(byProvider.values()).map((provider) => ({
    provider,
    binding: bindings.find((item) => item.provider === provider.provider) ?? null,
  }));
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

  return <ShieldCheck size={16} />;
}

function isAxchenProvider(provider: SsoProvider) {
  const providerText = `${provider.provider} ${provider.slug} ${provider.logo ?? ''} ${provider.name}`.toLowerCase();
  return providerText.includes('casdoor') || providerText.includes('axchen');
}

function pdfThemePreviewClass(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'statement_red':
      return styles.previewStatement;
    case 'civic_blue':
      return styles.previewCivicBlue;
    default:
      return styles.previewClassic;
  }
}

function pdfThemeLabelKey(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'statement_red':
      return 'pdfThemeStatementRed';
    case 'civic_blue':
      return 'pdfThemeCivicBlue';
    default:
      return 'pdfThemeClassic';
  }
}

function pdfThemeDescriptionKey(theme: string) {
  switch (normalizePdfTheme(theme)) {
    case 'statement_red':
      return 'pdfThemeStatementRedDescription';
    case 'civic_blue':
      return 'pdfThemeCivicBlueDescription';
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
