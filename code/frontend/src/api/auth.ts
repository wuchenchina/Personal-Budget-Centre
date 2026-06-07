import { apiGet, apiPatch, apiPost, clearCsrfToken } from './http';
import type { AuthSession, LoginPayload, RegisterPayload, RegisterResult } from '../types/auth';

interface CurrentSessionResult {
  session: AuthSession | null;
}

export interface EmailVerificationResult {
  verified: boolean;
  alreadyVerified: boolean;
  email: string;
  username: string | null;
}

export interface UpdateProfilePayload {
  displayName: string;
  email: string;
}

export interface UpdateProfileResult {
  session: AuthSession;
  emailVerificationSent: boolean;
}

export interface UpdatePasswordPayload {
  currentPassword: string;
  password: string;
}

export function getCurrentSession(): Promise<AuthSession | null> {
  return apiGet<CurrentSessionResult>('/api/auth/me').then((result) => result.session);
}

export function login(payload: LoginPayload): Promise<AuthSession> {
  return apiPost<AuthSession>('/api/auth/login', payload);
}

export function register(payload: RegisterPayload): Promise<RegisterResult> {
  return apiPost<RegisterResult>('/api/auth/register', payload);
}

export function resendEmailVerification(email: string): Promise<{ sent: boolean; email: string }> {
  return apiPost<{ sent: boolean; email: string }>('/api/auth/email/resend', { email });
}

export function verifyEmailToken(token: string): Promise<EmailVerificationResult> {
  return apiGet<EmailVerificationResult>(
    `/api/auth/email/verify?token=${encodeURIComponent(token)}`,
  );
}

export function updateProfile(payload: UpdateProfilePayload): Promise<UpdateProfileResult> {
  return apiPatch<UpdateProfileResult>('/api/auth/profile', payload);
}

export function updatePassword(payload: UpdatePasswordPayload): Promise<{ changed: true }> {
  return apiPatch<{ changed: true }>('/api/auth/password', payload);
}

export function logout(): Promise<Record<string, never>> {
  return apiPost<Record<string, never>>('/api/auth/logout').finally(clearCsrfToken);
}
