const ssoMergeTokenKey = 'budgetCentre.ssoMergeToken';

export function setPendingSsoMergeToken(token: string) {
  window.sessionStorage.setItem(ssoMergeTokenKey, token);
}

export function consumePendingSsoMergeToken(): string | null {
  const token = window.sessionStorage.getItem(ssoMergeTokenKey);
  window.sessionStorage.removeItem(ssoMergeTokenKey);

  return token;
}

export function hasPendingSsoMergeToken(): boolean {
  return window.sessionStorage.getItem(ssoMergeTokenKey) !== null;
}
