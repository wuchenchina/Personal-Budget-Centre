import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { AuthSession, PasskeyCredential } from '../types/auth';

export type PublicKeyCredentialJSON = Record<string, unknown>;

interface PasskeyOptionsResponse {
  options: Record<string, unknown>;
}

interface PasskeyCredentialsResponse {
  credentials: PasskeyCredential[];
}

export function getPasskeyRegistrationOptions(): Promise<Record<string, unknown>> {
  return apiGet<PasskeyOptionsResponse>('/api/auth/passkey/register/options').then(
    (payload) => payload.options,
  );
}

export function verifyPasskeyRegistration(
  credential: PublicKeyCredentialJSON,
  deviceName?: string,
): Promise<PasskeyCredential[]> {
  return apiPost<PasskeyCredentialsResponse>('/api/auth/passkey/register/verify', {
    credential,
    deviceName: deviceName?.trim() || null,
  }).then((payload) => payload.credentials);
}

export function getPasskeyLoginOptions(email?: string): Promise<Record<string, unknown>> {
  const query = email?.trim() ? `?email=${encodeURIComponent(email.trim())}` : '';

  return apiGet<PasskeyOptionsResponse>(`/api/auth/passkey/login/options${query}`).then(
    (payload) => payload.options,
  );
}

export function verifyPasskeyLogin(credential: PublicKeyCredentialJSON): Promise<AuthSession> {
  return apiPost<AuthSession>('/api/auth/passkey/login/verify', { credential });
}

export function getPasskeyResetOptions(email: string): Promise<Record<string, unknown>> {
  return apiGet<PasskeyOptionsResponse>(
    `/api/auth/passkey/reset/options?email=${encodeURIComponent(email.trim())}`,
  ).then((payload) => payload.options);
}

export function verifyPasskeyReset(
  credential: PublicKeyCredentialJSON,
): Promise<{ passwordResetToken: string }> {
  return apiPost<{ passwordResetToken: string }>('/api/auth/passkey/reset/verify', { credential });
}

export function listPasskeyCredentials(): Promise<PasskeyCredential[]> {
  return apiGet<PasskeyCredentialsResponse>('/api/auth/passkey/credentials').then(
    (payload) => payload.credentials,
  );
}

export function updatePasskeyCredential(
  id: number,
  deviceName: string | null,
): Promise<PasskeyCredential[]> {
  return apiPatch<PasskeyCredentialsResponse>('/api/auth/passkey/credentials', {
    id,
    deviceName,
  }).then((payload) => payload.credentials);
}

export function deletePasskeyCredential(id: number): Promise<PasskeyCredential[]> {
  return apiDelete<PasskeyCredentialsResponse>('/api/auth/passkey/credentials', { id }).then(
    (payload) => payload.credentials,
  );
}
