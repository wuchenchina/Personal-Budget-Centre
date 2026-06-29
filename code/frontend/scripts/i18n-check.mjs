import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const i18nDir = path.join(root, 'src/i18n');
const backendDir = path.resolve(root, '../backend/internal/app');
const pdfRendererDir = path.resolve(root, '../pdf-renderer-dotnet/BudgetCentre.PdfRenderer');
const languages = ['sc', 'tc', 'ja', 'fr', 'ru', 'de'];
const failures = [];

const objectNames = [
  ['Dictionary', 'enDictionary'],
  ['RoleLabels', 'enRoleLabels'],
  ['BudgetShareRoleLabels', 'enBudgetShareRoleLabels'],
  ['BudgetStatusLabels', 'enBudgetStatusLabels'],
  ['VisibilityLabels', 'enVisibilityLabels'],
  ['PrincipalTypeLabels', 'enPrincipalTypeLabels'],
  ['UserStatusLabels', 'enUserStatusLabels'],
  ['WorkspaceTypeLabels', 'enWorkspaceTypeLabels'],
  ['CurrencyRateSourceLabels', 'enCurrencyRateSourceLabels'],
  ['ApiErrorMessages', 'enApiErrorMessages'],
];

const exactEnglishAllowlist = new Set([
  '-',
  'Admin',
  'Administrator',
  'API',
  'Archive',
  'AUD',
  'Budget',
  'BudgetCentre',
  'CAD',
  'CHF',
  'CNY',
  'Confirmation',
  'Date',
  'Date:',
  'Editor',
  'EUR',
  'Exception',
  'Export',
  'GBP',
  'HKD',
  'JPY',
  'Message',
  'MOP',
  'Name',
  'Note',
  'OK',
  'Pages',
  'Participants',
  'Passkey',
  'Passkeys',
  'PDF',
  'Position',
  'Rate',
  'Ref',
  'RUB',
  'SGD',
  'Signature',
  'Solo',
  'Source',
  'SSO',
  'Status',
  'Symbol',
  'Team',
  'Total',
  'Transaction',
  'Transactions',
  'TWD',
  'USD',
  'Variance',
  'WebAuthn',
]);

const englishTokenAllowlist = new Set([
  'api',
  'aud',
  'budgetcentre',
  'cad',
  'casdoor',
  'chf',
  'cny',
  'eur',
  'gbp',
  'go',
  'hkd',
  'https',
  'id',
  'json',
  'jpy',
  'mop',
  'pdf',
  'rub',
  'sgd',
  'sso',
  'twd',
  'usd',
  'webauthn',
]);

const enObjects = extractLanguageObjects(path.join(i18nDir, 'en.ts'), 'en');

for (const language of languages) {
  const filePath = path.join(i18nDir, `${language}.ts`);
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('...enDictionary')) {
    failures.push(`${language}: dictionary must not spread enDictionary`);
  }

  const objects = extractLanguageObjects(filePath, language);
  for (const [suffix, enName] of objectNames) {
    const localName = `${language}${suffix}`;
    compareObjectKeys(language, localName, objects[localName], enObjects[enName]);
    comparePlaceholders(language, localName, objects[localName], enObjects[enName]);
    compareEnglishResidue(language, localName, objects[localName], enObjects[enName]);
  }
}

checkBackendApiCodes();
checkPdfRendererLocalization();

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('i18n check passed');

function extractLanguageObjects(filePath, prefix) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const expectedNames = new Set(objectNames.map(([suffix]) => `${prefix}${suffix}`));
  const out = {};

  function visit(node) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !expectedNames.has(declaration.name.text)) {
          continue;
        }
        const initializer = unwrapExpression(declaration.initializer);
        if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
          failures.push(`${path.basename(filePath)}: ${declaration.name.text} is not an object literal`);
          continue;
        }
        out[declaration.name.text] = objectLiteralToMap(initializer);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return out;
}

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isSatisfiesExpression(current) || ts.isAsExpression(current))) {
    current = current.expression;
  }
  return current;
}

function objectLiteralToMap(node) {
  const map = new Map();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const key = propertyName(property.name);
    const value = stringValue(property.initializer);
    if (key && typeof value === 'string') {
      map.set(key, value);
    }
  }
  return map;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function stringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function compareObjectKeys(language, name, localMap, enMap) {
  if (!localMap) {
    failures.push(`${language}: missing ${name}`);
    return;
  }
  const localKeys = [...localMap.keys()].sort();
  const enKeys = [...enMap.keys()].sort();
  const missing = enKeys.filter((key) => !localMap.has(key));
  const extra = localKeys.filter((key) => !enMap.has(key));
  if (missing.length > 0) {
    failures.push(`${language}: ${name} missing keys: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    failures.push(`${language}: ${name} has extra keys: ${extra.join(', ')}`);
  }
}

function comparePlaceholders(language, name, localMap, enMap) {
  if (!localMap) {
    return;
  }
  for (const [key, enValue] of enMap.entries()) {
    const localValue = localMap.get(key);
    if (typeof localValue !== 'string') {
      continue;
    }
    const enPlaceholders = placeholders(enValue);
    const localPlaceholders = placeholders(localValue);
    if (enPlaceholders.join('|') !== localPlaceholders.join('|')) {
      failures.push(`${language}: ${name}.${key} placeholders ${localPlaceholders.join(',')} must match ${enPlaceholders.join(',')}`);
    }
  }
}

function compareEnglishResidue(language, name, localMap, enMap) {
  if (!localMap) {
    return;
  }
  for (const [key, enValue] of enMap.entries()) {
    const localValue = localMap.get(key);
    if (typeof localValue !== 'string') {
      continue;
    }
    if (localValue === enValue && !exactEnglishAllowlist.has(localValue)) {
      failures.push(`${language}: ${name}.${key} still equals English fallback: ${JSON.stringify(localValue)}`);
    }
    if (['fr', 'ru', 'de'].includes(language) && /[\u4e00-\u9fff]/u.test(localValue)) {
      failures.push(`${language}: ${name}.${key} contains CJK text: ${JSON.stringify(localValue)}`);
    }
    const residue = englishPhraseResidue(localValue, enValue);
    if (residue !== null) {
      failures.push(`${language}: ${name}.${key} contains untranslated English phrase "${residue}"`);
    }
  }
}

function englishPhraseResidue(localValue, enValue) {
  const localText = asciiWords(localValue).join(' ');
  const enWords = asciiWords(enValue);
  for (let size = 8; size >= 4; size -= 1) {
    for (let index = 0; index <= enWords.length - size; index += 1) {
      const candidate = enWords.slice(index, index + size);
      if (candidate.every((word) => englishTokenAllowlist.has(word))) {
        continue;
      }
      const phrase = candidate.join(' ');
      if (localText.includes(phrase)) {
        return phrase;
      }
    }
  }
  return null;
}

function asciiWords(value) {
  return value
    .replace(/\{[A-Za-z0-9_]+\}/g, ' ')
    .match(/[A-Za-z][A-Za-z'-]*/g)
    ?.map((word) => word.toLowerCase()) ?? [];
}

function placeholders(value) {
  return [...value.matchAll(/\{[A-Za-z0-9_]+\}/g)].map((match) => match[0]).sort();
}

function checkBackendApiCodes() {
  const output = execFileSync(
    'rg',
    ['-o', '--replace', '$1', 'apiError\\("([A-Z0-9_]+)"', backendDir],
    { encoding: 'utf8' },
  );
  const backendCodes = [...new Set(output.split(/\n/).filter(Boolean).map((line) => line.split(':').pop()))].sort();
  const enApiMessages = enObjects.enApiErrorMessages;
  const missing = backendCodes.filter((code) => !enApiMessages.has(code));
  if (missing.length > 0) {
    failures.push(`frontend apiErrorMessages missing backend codes: ${missing.join(', ')}`);
  }
}

function checkPdfRendererLocalization() {
  const support = fs.readFileSync(path.join(pdfRendererDir, 'PdfRenderSupport.cs'), 'utf8');
  const signature = fs.readFileSync(path.join(pdfRendererDir, 'PdfSignatureRenderer.cs'), 'utf8');
  const combined = `${support}\n${signature}`;
  if (combined.includes('(string En, string Tc, string Sc)')) {
    failures.push('PDF renderer still uses the old three-language tuple');
  }
  if (!combined.includes('LocalizedText') || !combined.includes('string Ja') || !combined.includes('string Fr') || !combined.includes('string Ru') || !combined.includes('string De')) {
    failures.push('PDF renderer LocalizedText must include en/tc/sc/ja/fr/ru/de');
  }
  for (const language of ['"ja"', '"fr"', '"ru"', '"de"']) {
    if (!combined.includes(language)) {
      failures.push(`PDF renderer does not branch for ${language}`);
    }
  }
}
