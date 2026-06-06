import type { CurrencyCode } from './budget';
import type { UserStatus } from './auth';

export interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  status: UserStatus;
  isAdmin: boolean;
  emailVerifiedAt: string | null;
  emailVerificationSentAt: string | null;
  defaultCurrency: CurrencyCode | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResult {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserUpdatePayload {
  id: number;
  username?: string | null;
  displayName?: string;
  status?: UserStatus;
  isAdmin?: boolean;
  emailVerified?: boolean;
}
