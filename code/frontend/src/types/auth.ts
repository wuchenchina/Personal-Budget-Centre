import type { CurrencyCode, WorkspaceRole } from './budget';

export type UserStatus = 'active' | 'disabled' | 'pending';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  timezone: string | null;
  locale: string | null;
  status: UserStatus;
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
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  displayName: string;
  defaultCurrency?: CurrencyCode;
}
