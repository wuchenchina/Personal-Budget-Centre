import type { BudgetSignatureLabelMode, CurrencyCode, PdfThemeKey, WorkspaceRole } from './budget';
import type { AppLanguage } from '../i18n/types';

export type UserStatus = 'active' | 'disabled' | 'pending';

export interface AuthUser {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  defaultCurrency: CurrencyCode | null;
  defaultPdfTheme: PdfThemeKey;
  pdfExportSettings: PdfExportSettings;
  status: UserStatus;
  isAdmin: boolean;
  emailVerifiedAt: string | null;
  hasPassword: boolean;
}

export interface PdfExportSettings {
  showWorkspace: boolean;
  pdfLanguages: AppLanguage[];
  signatureLabelMode: BudgetSignatureLabelMode;
  signatureLabelLanguages: AppLanguage[];
}

export interface AuthWorkspace {
  id: number;
  name: string;
  type: 'personal' | 'family' | 'team' | 'custom';
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'disabled' | 'left';
  defaultCurrency: CurrencyCode | null;
}

export interface WorkspaceMember {
  id: number;
  workspaceId: number;
  userId: number;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'disabled' | 'left';
  joinedAt: string | null;
}

export interface AuthSession {
  user: AuthUser;
  workspace: AuthWorkspace | null;
  csrfToken: string;
}

export type SsoProviderID = 'casdoor' | 'linux_do' | string;

export interface SsoProvider {
  provider: SsoProviderID;
  slug: string;
  name: string;
  logo: string | null;
}

export interface SsoBinding {
  provider: SsoProviderID;
  subject: string;
  username: string | null;
  email: string | null;
  linkedAt: string | null;
  updatedAt: string | null;
}

export interface PasskeyCredential {
  id: number;
  userId: number;
  credentialId: string;
  signCount: number;
  transports: string[];
  backupEligible: boolean;
  backupState: boolean;
  deviceName: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  username: string;
  email: string;
  displayName: string;
  defaultCurrency?: CurrencyCode | null;
}

export interface EmailVerificationRequired {
  requiresEmailVerification: true;
  email: string;
}

export type RegisterResult = AuthSession | EmailVerificationRequired;
