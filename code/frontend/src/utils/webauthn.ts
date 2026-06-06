import type { PublicKeyCredentialJSON } from '../api/passkeys';

type JsonObject = Record<string, unknown>;

export async function createPasskeyCredential(
  rawOptions: JsonObject,
): Promise<PublicKeyCredentialJSON> {
  assertWebAuthnSupport();
  const credential = await navigator.credentials.create({
    publicKey: normalizeCreationOptions(rawOptions),
  });

  return publicKeyCredentialToJSON(credential);
}

export async function getPasskeyCredential(
  rawOptions: JsonObject,
): Promise<PublicKeyCredentialJSON> {
  assertWebAuthnSupport();
  const credential = await navigator.credentials.get({
    publicKey: normalizeRequestOptions(rawOptions),
  });

  return publicKeyCredentialToJSON(credential);
}

function normalizeCreationOptions(options: JsonObject): PublicKeyCredentialCreationOptions {
  const user = objectValue(options.user, 'user');

  return {
    ...options,
    challenge: base64urlToArrayBuffer(stringValue(options.challenge, 'challenge')),
    user: {
      ...user,
      id: base64urlToArrayBuffer(stringValue(user.id, 'user.id')),
    },
    excludeCredentials: credentialDescriptors(options.excludeCredentials),
  } as PublicKeyCredentialCreationOptions;
}

function normalizeRequestOptions(options: JsonObject): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(stringValue(options.challenge, 'challenge')),
    allowCredentials: credentialDescriptors(options.allowCredentials),
  } as PublicKeyCredentialRequestOptions;
}

function credentialDescriptors(value: unknown): PublicKeyCredentialDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const descriptor = objectValue(item, 'credential descriptor');

    return {
      ...descriptor,
      id: base64urlToArrayBuffer(stringValue(descriptor.id, 'credential id')),
    } as PublicKeyCredentialDescriptor;
  });
}

function publicKeyCredentialToJSON(credential: Credential | null): PublicKeyCredentialJSON {
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Passkey ceremony did not return a public key credential.');
  }

  const response = credential.response;
  const responseJson: JsonObject = {
    clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
  };

  if (response instanceof AuthenticatorAttestationResponse) {
    responseJson.attestationObject = arrayBufferToBase64url(response.attestationObject);
    const transports = response.getTransports();
    if (transports.length > 0) {
      responseJson.transports = transports;
    }
  }

  if (response instanceof AuthenticatorAssertionResponse) {
    responseJson.authenticatorData = arrayBufferToBase64url(response.authenticatorData);
    responseJson.signature = arrayBufferToBase64url(response.signature);
    responseJson.userHandle =
      response.userHandle === null ? null : arrayBufferToBase64url(response.userHandle);
  }

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: responseJson,
  };
}

function assertWebAuthnSupport(): void {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('This browser does not support passkeys.');
  }
}

function objectValue(value: unknown, fieldName: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid passkey option: ${fieldName}.`);
  }

  return value as JsonObject;
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Invalid passkey option: ${fieldName}.`);
  }

  return value;
}

function base64urlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = window.atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
