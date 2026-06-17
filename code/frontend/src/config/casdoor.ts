import SDK from 'casdoor-js-sdk';

export const casdoorConfig = {
  serverUrl: 'https://sso.axchen.top',
  clientId: '3e4912a22fdbce3dd6ca',
  appName: 'app-built-in',
  organizationName: 'built-in',
  redirectPath: '/api/callback',
  signinPath: '/api/Callback',
};

export const casdoorSdk = new SDK(casdoorConfig);

const casdoorIntentKey = 'budgetCentre.casdoorIntent';

export type CasdoorIntent = 'login' | 'bind';

export function setCasdoorIntent(intent: CasdoorIntent) {
  window.sessionStorage.setItem(casdoorIntentKey, intent);
}

export function startCasdoorSignin(intent: CasdoorIntent = 'login') {
  setCasdoorIntent(intent);
  window.location.assign(casdoorSdk.getSigninUrl());
}

export function consumeCasdoorIntent(): CasdoorIntent {
  const intent = window.sessionStorage.getItem(casdoorIntentKey);
  window.sessionStorage.removeItem(casdoorIntentKey);

  return intent === 'bind' ? 'bind' : 'login';
}
