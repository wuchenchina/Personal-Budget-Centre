const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isRemoteAppUrl,
  isTrustedInAppUrl,
  navigationTarget,
  sanitizeDownloadFilename,
} = require('../dist/url-policy.js');

test('only allows the configured production and SSO origins in the app', () => {
  assert.equal(isTrustedInAppUrl('https://bc.tool.axchen.top/'), true);
  assert.equal(isTrustedInAppUrl('https://sso.axchen.top/login/oauth/authorize'), true);
  assert.equal(isTrustedInAppUrl('https://connect.linux.do/oauth2/authorize'), true);
  assert.equal(isTrustedInAppUrl('https://bc.tool.axchen.top.evil.example/'), false);
  assert.equal(isTrustedInAppUrl('http://bc.tool.axchen.top/'), false);
});

test('only treats the production origin as a same-session child window or download origin', () => {
  assert.equal(isRemoteAppUrl('https://bc.tool.axchen.top/budgets/42'), true);
  assert.equal(isRemoteAppUrl('https://sso.axchen.top/login'), false);
  assert.equal(isRemoteAppUrl('https://bc.tool.axchen.top.evil.example/'), false);
});

test('sends conventional external links to the system and blocks unsafe schemes', () => {
  assert.equal(navigationTarget('https://example.com/'), 'system-browser');
  assert.equal(navigationTarget('http://example.com/'), 'system-browser');
  assert.equal(navigationTarget('mailto:person@example.com'), 'system-browser');
  assert.equal(navigationTarget('file:///etc/passwd'), 'blocked');
  assert.equal(navigationTarget('javascript:alert(1)'), 'blocked');
  assert.equal(navigationTarget('data:text/html,hello'), 'blocked');
});

test('sanitizes server supplied download names before writing to Downloads', () => {
  assert.equal(sanitizeDownloadFilename('budget.pdf'), 'budget.pdf');
  assert.equal(sanitizeDownloadFilename('../../budget.pdf'), '_.._budget.pdf');
  assert.equal(sanitizeDownloadFilename(' folder\\report.xlsx '), 'folder_report.xlsx');
  assert.equal(sanitizeDownloadFilename('...'), null);
  assert.equal(sanitizeDownloadFilename('\u0000\u0001'), null);
});
