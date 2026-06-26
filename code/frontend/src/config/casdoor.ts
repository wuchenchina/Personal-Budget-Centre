export const casdoorConfig = {
  serverUrl: '',
  clientId: '',
  appName: 'app-built-in',
  organizationName: 'built-in',
  redirectPath: '/api/callback',
  signinPath: '/api/Callback',
};

const casdoorIntentKey = 'budgetCentre.casdoorIntent';

export type CasdoorIntent = 'login' | 'bind';

export function setCasdoorIntent(intent: CasdoorIntent) {
  window.sessionStorage.setItem(casdoorIntentKey, intent);
}

export function startCasdoorSignin(intent: CasdoorIntent = 'login') {
  setCasdoorIntent(intent);
  window.location.assign(`/api/auth/casdoor/authorize?mode=${encodeURIComponent(intent)}`);
}

export function consumeCasdoorIntent(): CasdoorIntent {
  const intent = window.sessionStorage.getItem(casdoorIntentKey);
  window.sessionStorage.removeItem(casdoorIntentKey);

  return intent === 'bind' ? 'bind' : 'login';
}
