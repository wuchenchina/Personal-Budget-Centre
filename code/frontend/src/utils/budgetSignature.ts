import dayjs from 'dayjs';
import type { AppLanguage } from '../i18n';
import type { WorkspaceMember } from '../types/auth';
import type {
  BudgetSignatureCustomField,
  BudgetSignatureLabelLanguage,
  BudgetSignatureLabelAlign,
  BudgetSignatureLabelMode,
  BudgetSignatureLabelSeparator,
  BudgetSignatureConfig,
  BudgetSignatureParticipantType,
  BudgetSignatureRow,
  BudgetSignatureSectionAlign,
} from '../types/budget';
import type { BudgetSignatureFormRow } from '../types/forms';

export const defaultSignatureTitle = 'Preparation & Review Record';

type BaseSignatureLanguage = 'en' | 'sc' | 'tc';
type SignaturePhrase = Record<BaseSignatureLanguage, string>;

const signatureSectionTitleText: Record<BudgetSignatureLabelLanguage, string> = {
  en: 'Preparation & Review Record',
  sc: '制表及复核记录',
  tc: '製表及覆核記錄',
  en_sc: 'Preparation & Review Record 制表及复核记录',
  en_tc: 'Preparation & Review Record 製表及覆核記錄',
};

const signatureLabelText: Record<BudgetSignatureLabelLanguage, Record<'confirmation' | 'signature', string>> = {
  en: {
    confirmation: 'Confirmation',
    signature: 'Signature',
  },
  sc: {
    confirmation: '确认',
    signature: '签署',
  },
  tc: {
    confirmation: '確認',
    signature: '簽署',
  },
  en_sc: {
    confirmation: 'Confirmation / 确认',
    signature: 'Signature / 签署',
  },
  en_tc: {
    confirmation: 'Confirmation / 確認',
    signature: 'Signature / 簽署',
  },
};

const signatureMetaLabelText: Record<
  BudgetSignatureLabelLanguage,
  Record<'name' | 'capacity' | 'position' | 'email' | 'dateTime' | 'telephone' | 'mobile', string>
> = {
  en: {
    name: 'Name',
    capacity: 'Capacity',
    position: 'Position',
    email: 'Email',
    dateTime: 'Date & Time',
    telephone: 'Tel. No.',
    mobile: 'Mobile No.',
  },
  sc: {
    name: '姓名',
    capacity: '身份',
    position: '职务',
    email: '电子邮件',
    dateTime: '日期及时间',
    telephone: '电话号码',
    mobile: '流动电话号码',
  },
  tc: {
    name: '姓名',
    capacity: '身份',
    position: '職務',
    email: '電子郵件',
    dateTime: '日期及時間',
    telephone: '電話號碼',
    mobile: '流動電話號碼',
  },
  en_sc: {
    name: 'Name / 姓名',
    capacity: 'Capacity / 身份',
    position: 'Position / 职务',
    email: 'Email / 电子邮件',
    dateTime: 'Date & Time / 日期及时间',
    telephone: 'Tel. No. / 电话号码',
    mobile: 'Mobile No. / 流动电话号码',
  },
  en_tc: {
    name: 'Name / 姓名',
    capacity: 'Capacity / 身份',
    position: 'Position / 職務',
    email: 'Email / 電子郵件',
    dateTime: 'Date & Time / 日期及時間',
    telephone: 'Tel. No. / 電話號碼',
    mobile: 'Mobile No. / 流動電話號碼',
  },
};

const signatureRolePhrases = [
  { en: 'Prepared by', sc: '制表', tc: '製表' },
  { en: 'Handled by', sc: '经办', tc: '經辦' },
  { en: 'Checked by', sc: '复核', tc: '覆核' },
  { en: 'Reviewed by', sc: '审核', tc: '審核' },
  { en: 'Approved by', sc: '审批', tc: '審批' },
  { en: 'Audited by', sc: '审计', tc: '審計' },
  { en: 'Confirmed by', sc: '确认', tc: '確認' },
  { en: 'Verified by', sc: '核验', tc: '核驗' },
  { en: 'Authorised by', sc: '授权', tc: '授權' },
  { en: 'Accepted by', sc: '接纳', tc: '接納' },
  { en: 'Acknowledged by', sc: '知悉确认', tc: '知悉確認' },
  { en: 'Reconciled by', sc: '对账', tc: '對賬' },
  { en: 'Documented by', sc: '记录', tc: '記錄' },
  { en: 'Processed by', sc: '处理', tc: '處理' },
  { en: 'Finance reviewed by', sc: '财务复核', tc: '財務覆核' },
] satisfies SignaturePhrase[];

const signaturePositionPhrases = [
  { en: 'Account Holder', sc: '账户持有人', tc: '帳戶持有人' },
  { en: 'Budget Owner', sc: '预算负责人', tc: '預算負責人' },
  { en: 'Finance Owner', sc: '财务负责人', tc: '財務負責人' },
  { en: 'Finance Officer', sc: '财务专员', tc: '財務專員' },
  { en: 'Accounts Officer', sc: '会计专员', tc: '會計專員' },
  { en: 'Relationship Manager', sc: '客户经理', tc: '客戶經理' },
  { en: 'Operations Officer', sc: '运营专员', tc: '營運專員' },
  { en: 'Compliance Reviewer', sc: '合规复核', tc: '合規覆核' },
  { en: 'Reviewer', sc: '复核人', tc: '覆核人' },
  { en: 'Approver', sc: '审批人', tc: '審批人' },
  { en: 'Internal Auditor', sc: '内部审计', tc: '內部審計' },
  { en: 'External Auditor', sc: '外部审计', tc: '外部審計' },
  { en: 'Authorised Representative', sc: '授权代表', tc: '授權代表' },
] satisfies SignaturePhrase[];

export function emptySignatureConfig(): BudgetSignatureConfig {
  return {
    enabled: false,
    customTitleEnabled: false,
    title: defaultSignatureTitle,
    infoLanguage: 'en',
    labelLanguage: 'en',
    labelMode: 'confirmation_signature',
    labelSeparator: 'space',
    sectionAlign: 'full',
    labelAlign: 'left',
    showControlText: true,
    rows: [],
  };
}

export function createSignatureRow(
  participantType: BudgetSignatureParticipantType = 'manual',
): BudgetSignatureRow {
  return {
    id: signatureRowId(),
    participantType,
    memberUserId: null,
    roleLabel: '',
    displayName: '',
    email: null,
    position: null,
    signedAt: null,
    customFields: [],
    showRole: true,
    showName: true,
    showEmail: false,
    showPosition: false,
    showSignature: true,
    showDateTime: true,
  };
}

export function createSignatureCustomField(): BudgetSignatureCustomField {
  return createSignatureCustomFieldWithValue();
}

export function createSignatureCustomFieldWithValue(
  label = '',
  value = '',
): BudgetSignatureCustomField {
  return {
    id: signatureCustomFieldId(),
    label,
    value,
    show: true,
  };
}

export function signatureRowFromMember(
  member: WorkspaceMember,
  roleLabel = '',
): BudgetSignatureRow {
  return {
    ...createSignatureRow('workspace_member'),
    memberUserId: member.userId,
    roleLabel,
    displayName: member.displayName,
    email: member.email,
  };
}

export function signatureConfigToForm(
  config: BudgetSignatureConfig | null | undefined,
  displayLanguage?: BudgetSignatureLabelLanguage,
): BudgetFormSignatureConfig {
  const normalized = normalizeSignatureConfig(config);
  const language = displayLanguage === undefined ? normalized.infoLanguage : normalizeLabelLanguage(displayLanguage);

  return {
    enabled: normalized.enabled,
    customTitleEnabled: normalized.customTitleEnabled,
    title: normalized.title,
    infoLanguage: normalized.infoLanguage,
    labelLanguage: normalized.labelLanguage,
    labelMode: normalized.labelMode,
    labelSeparator: normalized.labelSeparator,
    sectionAlign: normalized.sectionAlign,
    labelAlign: normalized.labelAlign,
    showControlText: normalized.showControlText,
    rows: normalized.rows.map((row) => ({
      ...row,
      roleLabel: translateSignaturePhrase(row.roleLabel, signatureRolePhrases, language),
      position: row.position === null ? null : translateSignaturePhrase(row.position, signaturePositionPhrases, language),
      customFields: row.customFields.map((field) => ({
        ...field,
        label: signatureCustomFieldLabelForLanguage(field.label, language),
      })),
      signedAt: row.signedAt === null ? null : dayjs(row.signedAt),
    })),
  };
}

export function signatureConfigFromForm(
  config: BudgetFormSignatureConfig | null | undefined,
): BudgetSignatureConfig {
  if (config === null || config === undefined) {
    return emptySignatureConfig();
  }

  return normalizeSignatureConfig({
    enabled: config.enabled === true,
    customTitleEnabled: config.customTitleEnabled === true,
    title: config.title,
    infoLanguage: config.infoLanguage,
    labelLanguage: config.labelLanguage,
    labelMode: config.labelMode,
    labelSeparator: config.labelSeparator,
    sectionAlign: config.sectionAlign,
    labelAlign: config.labelAlign,
    showControlText: config.showControlText !== false,
    rows: (config.rows ?? []).map((row) => ({
      ...row,
      signedAt: row.signedAt?.format('YYYY-MM-DD HH:mm:ss') ?? null,
    })),
  });
}

export function normalizeSignatureConfig(
  config: BudgetSignatureConfig | null | undefined,
): BudgetSignatureConfig {
  if (config === null || config === undefined) {
    return emptySignatureConfig();
  }
  const infoLanguage = normalizeLabelLanguage(config.infoLanguage ?? config.labelLanguage);
  const customTitleEnabled = config.customTitleEnabled === true;

  return {
    enabled: config.enabled === true,
    customTitleEnabled,
    title: customTitleEnabled ? normalizeSignatureTitle(config.title, infoLanguage) : signatureTitleForLanguage(infoLanguage),
    infoLanguage,
    labelLanguage: normalizeLabelLanguage(config.labelLanguage),
    labelMode: normalizeLabelMode(config.labelMode),
    labelSeparator: normalizeLabelSeparator(config.labelSeparator),
    sectionAlign: normalizeSectionAlign(config.sectionAlign),
    labelAlign: normalizeLabelAlign(config.labelAlign),
    showControlText: config.showControlText !== false,
    rows: Array.isArray(config.rows)
      ? config.rows.map(normalizeSignatureRow).filter((row) => row !== null)
      : [],
  };
}

export function signatureLabelForConfig(config: BudgetSignatureConfig): string {
  const language = normalizeLabelLanguage(config.labelLanguage);
  const labels = signatureLabelText[signaturePrimaryLanguage(language)];
  const mode = normalizeLabelMode(config.labelMode);
  const parts =
    mode === 'confirmation_signature'
      ? [labels.confirmation, labels.signature]
      : [labels[mode]];

  const englishLabel = joinSignatureLabelParts(parts, normalizeLabelSeparator(config.labelSeparator));
  if (language === 'en_sc' || language === 'en_tc') {
    const chineseLabels = signatureLabelText[language === 'en_sc' ? 'sc' : 'tc'];
    const chineseParts =
      mode === 'confirmation_signature'
        ? [chineseLabels.confirmation, chineseLabels.signature]
        : [chineseLabels[mode]];

    return `${englishLabel}\n${joinSignatureLabelParts(chineseParts, normalizeLabelSeparator(config.labelSeparator))}`;
  }

  return englishLabel;
}

function joinSignatureLabelParts(parts: string[], separator: BudgetSignatureLabelSeparator): string {
  if (parts.length === 1) {
    return parts[0];
  }
  if (separator === 'slash') {
    return parts.join(' / ');
  }
  if (separator === 'line') {
    return parts.join('\n');
  }
  if (separator === 'none') {
    return parts.join('');
  }

  return parts.join(' ');
}

export function signatureRoleForDisplay(config: BudgetSignatureConfig, value: string): string {
  const language = signatureInfoLanguage(config);
  const trimmed = value.trim();
  const defaultRole: Record<BudgetSignatureLabelLanguage, string> = {
    en: 'Confirmed by',
    sc: '确认人',
    tc: '確認人',
    en_sc: 'Confirmed by / 确认',
    en_tc: 'Confirmed by / 確認',
  };
  if (trimmed === '') {
    return defaultRole[language];
  }

  const legacyRoleLabels = [
    'Confirmation Signature',
    'Confirmation / Signature',
    'Participant',
    'Signer / Confirmer',
    '确认签署',
    '确认 / 签署',
    '签核/确认人',
    '確認簽署',
    '確認 / 簽署',
    '簽核/確認人',
  ];

  if (legacyRoleLabels.includes(trimmed) || trimmed === signatureLabelForConfig(config)) {
    return defaultRole[language];
  }

  return translateSignaturePhrase(trimmed, signatureRolePhrases, language);
}

export function signaturePositionForDisplay(config: BudgetSignatureConfig, value: string): string {
  return translateSignaturePhrase(value, signaturePositionPhrases, signatureInfoLanguage(config));
}

export function signatureCustomFieldLabelForDisplay(config: BudgetSignatureConfig, value: string): string {
  return signatureCustomFieldLabelForLanguage(value, signatureInfoLanguage(config));
}

export function signatureInfoLanguage(config: BudgetSignatureConfig): BudgetSignatureLabelLanguage {
  return normalizeLabelLanguage(config.infoLanguage ?? config.labelLanguage);
}

export function signatureLanguageFromAppLanguage(
  language: AppLanguage,
): BudgetSignatureLabelLanguage {
  return language === 'sc' || language === 'tc' ? language : 'en';
}

export function signatureMetaLabelsForLanguage(
  language: BudgetSignatureLabelLanguage,
): Record<'name' | 'capacity' | 'position' | 'email' | 'dateTime' | 'telephone' | 'mobile', string> {
  return signatureMetaLabelText[normalizeLabelLanguage(language)];
}

export function signatureRolePhraseOptions(
  language: BudgetSignatureLabelLanguage,
): Array<{ value: string }> {
  return signatureRolePhrases.map((phrase) => ({ value: phraseForLanguage(phrase, normalizeLabelLanguage(language)) }));
}

export function signaturePositionPhraseOptions(
  language: BudgetSignatureLabelLanguage,
): Array<{ value: string }> {
  return signaturePositionPhrases.map((phrase) => ({ value: phraseForLanguage(phrase, normalizeLabelLanguage(language)) }));
}

export function signatureCustomFieldLabelOptions(
  language: BudgetSignatureLabelLanguage,
): Array<{ value: string }> {
  const labels = signatureMetaLabelsForLanguage(language);

  return [
    labels.telephone,
    labels.mobile,
  ].map((value) => ({ value }));
}

export function signatureTitleForLanguage(language: BudgetSignatureLabelLanguage): string {
  return signatureSectionTitleText[normalizeLabelLanguage(language)];
}

export function signatureTitleForDisplay(config: BudgetSignatureConfig, fallbackTitle: string): string {
  return normalizeSignatureTitle(config.title, signatureInfoLanguage(config), fallbackTitle);
}

export function memberOptions(members: WorkspaceMember[]): Array<{ label: string; value: number }> {
  return members
    .filter((member) => member.status === 'active')
    .map((member) => ({
      label: `${member.displayName} <${member.email}>`,
      value: member.userId,
    }));
}

function normalizeSignatureRow(row: Partial<BudgetSignatureRow>): BudgetSignatureRow | null {
  const id = normalizeText(row.id) ?? signatureRowId();
  const participantType: BudgetSignatureParticipantType =
    row.participantType === 'workspace_member' ? 'workspace_member' : 'manual';
  const displayName = normalizeText(row.displayName) ?? '';
  const roleLabel = normalizeText(row.roleLabel) ?? '';
  const email = normalizeText(row.email);
  const position = normalizeText(row.position);
  const signedAt = normalizeText(row.signedAt);
  const customFields = Array.isArray(row.customFields)
    ? row.customFields.map(normalizeSignatureCustomField).filter((field) => field !== null).slice(0, 12)
    : [];

  if (
    displayName === ''
    && roleLabel === ''
    && email === null
    && position === null
    && signedAt === null
    && customFields.length === 0
    && row.memberUserId === null
  ) {
    return null;
  }

  return {
    id,
    participantType,
    memberUserId: Number.isInteger(row.memberUserId) ? row.memberUserId ?? null : null,
    roleLabel,
    displayName,
    email,
    position,
    signedAt,
    customFields,
    showRole: row.showRole !== false,
    showName: row.showName !== false,
    showEmail: row.showEmail === true,
    showPosition: row.showPosition === true,
    showSignature: row.showSignature !== false,
    showDateTime: row.showDateTime !== false,
  };
}

function normalizeSignatureCustomField(
  field: Partial<BudgetSignatureCustomField>,
): BudgetSignatureCustomField | null {
  const label = normalizeText(field.label) ?? '';
  const value = normalizeText(field.value) ?? '';

  if (label === '' && value === '') {
    return null;
  }

  return {
    id: normalizeText(field.id) ?? signatureCustomFieldId(),
    label,
    value,
    show: field.show !== false,
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function normalizeLabelLanguage(value: unknown): BudgetSignatureLabelLanguage {
  return value === 'sc' || value === 'tc' || value === 'en' || value === 'en_sc' || value === 'en_tc'
    ? value
    : 'en';
}

function translateSignaturePhrase(
  value: string,
  phrases: SignaturePhrase[],
  language: BudgetSignatureLabelLanguage,
): string {
  const trimmed = value.trim();
  const phrase = phrases.find((item) =>
    item.en === trimmed || item.sc === trimmed || item.tc === trimmed,
  );

  if (phrase === undefined) {
    return value;
  }

  return phraseForLanguage(phrase, language);
}

function signatureCustomFieldLabelForLanguage(
  value: string,
  language: BudgetSignatureLabelLanguage,
): string {
  const labelsByLanguage = Object.values(signatureMetaLabelText);
  const isTelephone = labelsByLanguage.some((labels) => labels.telephone === value.trim());
  if (isTelephone) {
    return signatureMetaLabelText[language].telephone;
  }

  const isMobile = labelsByLanguage.some((labels) => labels.mobile === value.trim());
  if (isMobile) {
    return signatureMetaLabelText[language].mobile;
  }

  return value;
}

function phraseForLanguage(phrase: SignaturePhrase, language: BudgetSignatureLabelLanguage): string {
  if (language === 'en_sc') {
    return `${phrase.en} / ${phrase.sc}`;
  }
  if (language === 'en_tc') {
    return `${phrase.en} / ${phrase.tc}`;
  }

  return phrase[language];
}

function signaturePrimaryLanguage(language: BudgetSignatureLabelLanguage): BaseSignatureLanguage {
  return language === 'en_sc' || language === 'en_tc' ? 'en' : language;
}

function normalizeSignatureTitle(
  value: unknown,
  language: BudgetSignatureLabelLanguage,
  fallbackTitle = defaultSignatureTitle,
): string {
  const title = normalizeText(value) ?? fallbackTitle;
  const legacyTitles = [
    'Confirmation Signature',
    '签核确认信息',
    '簽核確認資訊',
  ];

  return legacyTitles.includes(title) ? signatureSectionTitleText[language] : title;
}

function normalizeLabelMode(value: unknown): BudgetSignatureLabelMode {
  if (value === 'confirmation' || value === 'signature' || value === 'confirmation_signature') {
    return value;
  }

  return 'confirmation_signature';
}

function normalizeLabelSeparator(value: unknown): BudgetSignatureLabelSeparator {
  if (value === 'none' || value === 'slash' || value === 'line' || value === 'space') {
    return value;
  }

  return 'space';
}

function normalizeSectionAlign(value: unknown): BudgetSignatureSectionAlign {
  return value === 'right' ? 'right' : 'full';
}

function normalizeLabelAlign(value: unknown): BudgetSignatureLabelAlign {
  return value === 'right' ? 'right' : 'left';
}

function signatureRowId(): string {
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function signatureCustomFieldId(): string {
  return `sig_field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface BudgetFormSignatureConfig {
  enabled: boolean;
  customTitleEnabled: boolean;
  title: string;
  infoLanguage: BudgetSignatureLabelLanguage;
  labelLanguage: BudgetSignatureLabelLanguage;
  labelMode: BudgetSignatureLabelMode;
  labelSeparator: BudgetSignatureLabelSeparator;
  sectionAlign: BudgetSignatureSectionAlign;
  labelAlign: BudgetSignatureLabelAlign;
  showControlText: boolean;
  rows: BudgetSignatureFormRow[];
}
