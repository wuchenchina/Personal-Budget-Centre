import dayjs from 'dayjs';
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

export const defaultSignatureTitle = 'Confirmation Signature';

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
};

export function emptySignatureConfig(): BudgetSignatureConfig {
  return {
    enabled: false,
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
): BudgetFormSignatureConfig {
  const normalized = normalizeSignatureConfig(config);

  return {
    enabled: normalized.enabled,
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

  return {
    enabled: config.enabled === true,
    title: normalizeText(config.title) ?? defaultSignatureTitle,
    infoLanguage: normalizeLabelLanguage(config.infoLanguage ?? config.labelLanguage),
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
  const labels = signatureLabelText[normalizeLabelLanguage(config.labelLanguage)];
  const mode = normalizeLabelMode(config.labelMode);
  const parts =
    mode === 'confirmation_signature'
      ? [labels.confirmation, labels.signature]
      : [labels[mode]];

  if (parts.length === 1) {
    return parts[0];
  }

  const separator = normalizeLabelSeparator(config.labelSeparator);
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

  return legacyRoleLabels.includes(trimmed) || trimmed === signatureLabelForConfig(config)
    ? defaultRole[language]
    : trimmed;
}

export function signatureInfoLanguage(config: BudgetSignatureConfig): BudgetSignatureLabelLanguage {
  return normalizeLabelLanguage(config.infoLanguage ?? config.labelLanguage);
}

export function signatureMetaLabelsForLanguage(
  language: BudgetSignatureLabelLanguage,
): Record<'name' | 'capacity' | 'position' | 'email' | 'dateTime' | 'telephone' | 'mobile', string> {
  return signatureMetaLabelText[normalizeLabelLanguage(language)];
}

export function signatureTitleForLanguage(language: BudgetSignatureLabelLanguage): string {
  const labels = signatureLabelText[language];

  return language === 'en'
    ? `${labels.confirmation} ${labels.signature}`
    : `${labels.confirmation}${labels.signature}`;
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
  return value === 'sc' || value === 'tc' || value === 'en' ? value : 'en';
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
