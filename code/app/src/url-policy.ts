export const remoteAppOrigin = 'https://bc.tool.axchen.top';

const trustedInAppOrigins = new Set([
  remoteAppOrigin,
  'https://sso.axchen.top',
  'https://connect.linux.do',
]);

export type NavigationTarget = 'in-app' | 'system-browser' | 'blocked';

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isTrustedInAppUrl(value: string): boolean {
  const url = parseUrl(value);

  return url !== null && url.protocol === 'https:' && trustedInAppOrigins.has(url.origin);
}

export function isRemoteAppUrl(value: string): boolean {
  const url = parseUrl(value);

  return url !== null && url.protocol === 'https:' && url.origin === remoteAppOrigin;
}

export function navigationTarget(value: string): NavigationTarget {
  if (isTrustedInAppUrl(value)) {
    return 'in-app';
  }

  const url = parseUrl(value);
  if (url !== null && (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:')) {
    return 'system-browser';
  }

  return 'blocked';
}

export function sanitizeDownloadFilename(value: string): string | null {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()
    .replace(/^\.+/, '');

  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return null;
  }

  return cleaned.slice(0, 180);
}
