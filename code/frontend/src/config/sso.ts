import type { SsoProvider, SsoProviderID } from '../types/auth';

const ssoIntentKey = 'budgetCentre.ssoIntent';

export type SsoIntentMode = 'login' | 'bind' | 'reset';

interface StoredSsoIntent {
  provider: SsoProviderID;
  mode: SsoIntentMode;
}

export function setSsoIntent(provider: SsoProviderID, mode: SsoIntentMode) {
  window.sessionStorage.setItem(ssoIntentKey, JSON.stringify({ provider, mode }));
}

export function startSsoSignin(provider: SsoProvider, mode: SsoIntentMode = 'login') {
  setSsoIntent(provider.provider, mode);
  window.location.assign(`/api/auth/sso/${provider.slug}/authorize?mode=${encodeURIComponent(mode)}`);
}

export function consumeSsoIntent(): StoredSsoIntent {
  const raw = window.sessionStorage.getItem(ssoIntentKey);
  window.sessionStorage.removeItem(ssoIntentKey);
  if (raw === null || raw.trim() === '') {
    return { provider: '', mode: 'login' };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSsoIntent>;
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : '',
      mode: parsed.mode === 'bind' || parsed.mode === 'reset' ? parsed.mode : 'login',
    };
  } catch {
    return { provider: '', mode: raw === 'bind' || raw === 'reset' ? raw : 'login' };
  }
}

export function ssoProviderName(provider: SsoProvider | undefined, fallback: SsoProviderID) {
  if (provider?.name) {
    return provider.name;
  }

  switch (fallback) {
    case 'casdoor':
      return 'Axchen SSO';
    case 'linux_do':
      return 'Linux Do';
    default:
      return fallback || 'SSO';
  }
}
