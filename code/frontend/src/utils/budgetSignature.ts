import dayjs from 'dayjs';
import type { WorkspaceMember } from '../types/auth';
import type {
  BudgetSignatureLabelLanguage,
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

export function emptySignatureConfig(): BudgetSignatureConfig {
  return {
    enabled: false,
    title: defaultSignatureTitle,
    labelLanguage: 'en',
    labelMode: 'confirmation_signature',
    labelSeparator: 'space',
    sectionAlign: 'full',
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
    showRole: true,
    showName: true,
    showEmail: false,
    showPosition: false,
    showSignature: true,
    showDateTime: true,
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
    labelLanguage: normalized.labelLanguage,
    labelMode: normalized.labelMode,
    labelSeparator: normalized.labelSeparator,
    sectionAlign: normalized.sectionAlign,
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
    labelLanguage: config.labelLanguage,
    labelMode: config.labelMode,
    labelSeparator: config.labelSeparator,
    sectionAlign: config.sectionAlign,
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
    labelLanguage: normalizeLabelLanguage(config.labelLanguage),
    labelMode: normalizeLabelMode(config.labelMode),
    labelSeparator: normalizeLabelSeparator(config.labelSeparator),
    sectionAlign: normalizeSectionAlign(config.sectionAlign),
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

  return parts.join(' ');
}

export function signatureTitleForLanguage(language: BudgetSignatureLabelLanguage): string {
  const labels = signatureLabelText[language];

  return `${labels.confirmation} ${labels.signature}`;
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

  if (
    displayName === ''
    && roleLabel === ''
    && email === null
    && position === null
    && signedAt === null
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
    showRole: row.showRole !== false,
    showName: row.showName !== false,
    showEmail: row.showEmail === true,
    showPosition: row.showPosition === true,
    showSignature: row.showSignature !== false,
    showDateTime: row.showDateTime !== false,
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
  if (value === 'slash' || value === 'line' || value === 'space') {
    return value;
  }

  return 'space';
}

function normalizeSectionAlign(value: unknown): BudgetSignatureSectionAlign {
  return value === 'right' ? 'right' : 'full';
}

function signatureRowId(): string {
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface BudgetFormSignatureConfig {
  enabled: boolean;
  title: string;
  labelLanguage: BudgetSignatureLabelLanguage;
  labelMode: BudgetSignatureLabelMode;
  labelSeparator: BudgetSignatureLabelSeparator;
  sectionAlign: BudgetSignatureSectionAlign;
  rows: BudgetSignatureFormRow[];
}
