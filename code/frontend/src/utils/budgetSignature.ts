import dayjs from 'dayjs';
import type { WorkspaceMember } from '../types/auth';
import type {
  BudgetSignatureConfig,
  BudgetSignatureParticipantType,
  BudgetSignatureRow,
} from '../types/budget';
import type { BudgetSignatureFormRow } from '../types/forms';

export const defaultSignatureTitle = 'Confirmation / Signature';

export function emptySignatureConfig(): BudgetSignatureConfig {
  return {
    enabled: false,
    title: defaultSignatureTitle,
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
    rows: Array.isArray(config.rows)
      ? config.rows.map(normalizeSignatureRow).filter((row) => row !== null)
      : [],
  };
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

function signatureRowId(): string {
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface BudgetFormSignatureConfig {
  enabled: boolean;
  title: string;
  rows: BudgetSignatureFormRow[];
}
