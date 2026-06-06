import { apiGet, apiPost, clearCsrfToken } from './http';
import type { AuthSession, LoginPayload, RegisterPayload } from '../types/auth';

export function getCurrentSession(): Promise<AuthSession> {
  return apiGet<AuthSession>('/api/auth/me');
}

export function login(payload: LoginPayload): Promise<AuthSession> {
  return apiPost<AuthSession>('/api/auth/login', payload);
}

export function register(payload: RegisterPayload): Promise<AuthSession> {
  return apiPost<AuthSession>('/api/auth/register', payload);
}

export function logout(): Promise<Record<string, never>> {
  return apiPost<Record<string, never>>('/api/auth/logout').finally(clearCsrfToken);
}
