import { apiDelete, apiGet, apiPatch, apiPost, clearCsrfToken } from './http';
import type {
  AuthSession,
  LoginPayload,
  PdfExportSettings,
  RegisterPayload,
  RegisterResult,
  SsoBinding,
  SsoProvider,
  SsoProviderID,
} from '../types/auth';
import type { CurrencyCode } from '../types/budget';

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
  defaultCurrency?: CurrencyCode | null;
  defaultPdfTheme?: AuthSession['user']['defaultPdfTheme'];
  pdfExportSettings?: PdfExportSettings;
}

export interface UpdateProfileResult {
  session: AuthSession;
  emailVerificationSent: boolean;
}

export interface UpdatePasswordPayload {
  currentPassword: string;
  password: string;
}

export interface PasswordResetTokenResult {
  passwordResetToken: string;
}

export interface PasswordResetVerifyResult {
  valid: true;
  email: string;
}

export interface SsoProviderListResult {
  providers: SsoProvider[];
}

export interface SsoBindingsResult {
  bindings: SsoBinding[];
  providers?: SsoProvider[];
}

export interface SsoMergeBeginResult {
  mergeToken: string;
}

export interface SsoMergeCompleteResult {
  session: AuthSession;
  bindings: SsoBinding[];
}

export interface SsoAccountActionRequired {
  requiresSsoAccountAction: true;
  ssoAccount: {
    provider: SsoProviderID;
    providerName: string;
    subject: string;
    username: string | null;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  ssoCreateToken: string;
}

export interface SsoCallbackPayload {
  provider?: SsoProviderID;
  code?: string;
  state?: string;
  accessToken?: string;
  idToken?: string;
  action?: 'create';
  ssoCreateToken?: string;
}

export type SsoCallbackMode = 'login' | 'bind' | 'reset';

export function getCurrentSession(): Promise<AuthSession | null> {
  return apiGet<CurrentSessionResult>('/api/auth/me').then((result) => result.session);
}

export function login(payload: LoginPayload): Promise<AuthSession> {
  return apiPost<AuthSession>('/api/auth/login', payload);
}

export function ssoCallback(
  payload: SsoCallbackPayload,
  mode: 'login',
): Promise<AuthSession | SsoAccountActionRequired>;
export function ssoCallback(payload: SsoCallbackPayload, mode: 'bind'): Promise<{ binding: SsoBinding }>;
export function ssoCallback(payload: SsoCallbackPayload, mode: 'reset'): Promise<PasswordResetTokenResult>;
export function ssoCallback(
  payload: SsoCallbackPayload,
  mode: SsoCallbackMode = 'login',
): Promise<AuthSession | { binding: SsoBinding } | SsoAccountActionRequired | PasswordResetTokenResult> {
  return apiPost<AuthSession | { binding: SsoBinding } | SsoAccountActionRequired | PasswordResetTokenResult>('/api/callback', {
    ...payload,
    mode,
  });
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

export function requestPasswordResetEmail(email: string): Promise<{ sent: true; email: string }> {
  return apiPost<{ sent: true; email: string }>('/api/auth/password-reset/email', { email });
}

export function verifyPasswordResetToken(token: string): Promise<PasswordResetVerifyResult> {
  return apiGet<PasswordResetVerifyResult>(
    `/api/auth/password-reset/verify?token=${encodeURIComponent(token)}`,
  );
}

export function completePasswordReset(payload: {
  token: string;
  password: string;
}): Promise<{ changed: true }> {
  return apiPost<{ changed: true }>('/api/auth/password-reset/complete', payload);
}

export function getSsoProviders(): Promise<SsoProviderListResult> {
  return apiGet<SsoProviderListResult>('/api/auth/sso-providers');
}

export function getSsoBindings(): Promise<SsoBindingsResult> {
  return apiGet<SsoBindingsResult>('/api/auth/sso-binding');
}

export function beginSsoMerge(provider: SsoProviderID): Promise<SsoMergeBeginResult> {
  return apiPost<SsoMergeBeginResult>('/api/auth/sso-merge', { action: 'begin', provider });
}

export function completeSsoMerge(mergeToken: string): Promise<SsoMergeCompleteResult> {
  return apiPost<SsoMergeCompleteResult>('/api/auth/sso-merge', {
    action: 'complete',
    mergeToken,
  });
}

export function unlinkSsoBinding(provider: SsoProviderID): Promise<SsoBindingsResult> {
  return apiDelete<SsoBindingsResult>(`/api/auth/sso-binding?provider=${encodeURIComponent(provider)}`);
}

export function logout(): Promise<Record<string, never>> {
  return apiPost<Record<string, never>>('/api/auth/logout').finally(clearCsrfToken);
}
