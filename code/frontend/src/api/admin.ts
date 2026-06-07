import { apiGet, apiPatch, apiPost } from './http';
import type {
  AdminEnvironmentCheck,
  AdminUser,
  AdminUserListResult,
  AdminUserUpdatePayload,
} from '../types/admin';
import type { UserStatus } from '../types/auth';

export interface AdminUserListParams {
  search?: string;
  status?: UserStatus | 'all';
  page?: number;
  pageSize?: number;
}

export function listAdminUsers(params: AdminUserListParams): Promise<AdminUserListResult> {
  const query = new URLSearchParams();
  if (params.search !== undefined && params.search.trim() !== '') {
    query.set('search', params.search.trim());
  }
  if (params.status !== undefined && params.status !== 'all') {
    query.set('status', params.status);
  }
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 30));

  return apiGet<AdminUserListResult>(`/api/admin/users?${query.toString()}`);
}

export function updateAdminUser(payload: AdminUserUpdatePayload): Promise<AdminUser> {
  return apiPatch<{ user: AdminUser }>('/api/admin/users', payload).then(({ user }) => user);
}

export function resendAdminEmailVerification(
  id: number,
): Promise<{ sent: boolean; email: string; alreadyVerified: boolean }> {
  return apiPost<{ sent: boolean; email: string; alreadyVerified: boolean }>(
    '/api/admin/users/email-verification',
    { id },
  );
}

export function getAdminEnvironment(): Promise<AdminEnvironmentCheck> {
  return apiGet<{ environment: AdminEnvironmentCheck }>('/api/admin/environment').then(
    ({ environment }) => environment,
  );
}
