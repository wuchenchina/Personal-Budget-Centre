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

export interface AdminUserCreatePayload {
  email: string;
  username: string;
  displayName: string;
  password: string;
  defaultCurrency: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AdminEnvironmentCheck {
  phpVersion: string;
  ok: boolean;
  extensions: Array<{
    name: string;
    loaded: boolean;
  }>;
  exportStorage: {
    path: string;
    configured: boolean;
    exists: boolean;
    writable: boolean;
    parentPath: string;
    parentWritable: boolean;
  };
  recommendations: string[];
}

export interface AdminExportCacheCleanupResult {
  exportPath: string;
  tempPath: string;
  deletedExports: number;
  deletedExportFiles: number;
  deletedExportBytes: number;
  deletedTempFiles: number;
  deletedTempDirectories: number;
  deletedTempBytes: number;
}
