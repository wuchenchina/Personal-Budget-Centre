import { languageOptions } from '../i18n';
import type { AppLanguage } from '../i18n';
import type { PdfExportSettings } from '../types/auth';
import type { BudgetSignatureLabelMode } from '../types/budget';

export const supportedPdfLanguages = languageOptions.map((option) => option.value) as AppLanguage[];

export const defaultPdfExportSettings: PdfExportSettings = {
  showWorkspace: false,
  pdfLanguages: ['en'],
  signatureLabelMode: 'confirmation_signature',
  signatureLabelLanguages: ['en'],
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && supportedPdfLanguages.includes(value as AppLanguage);
}

export function normalizePdfLanguages(value: unknown): AppLanguage[] {
  return resolveExclusiveChineseLanguages(uniquePdfLanguages(value));
}

export function resolveExclusiveChineseLanguages(languages: AppLanguage[]): AppLanguage[] {
  return applyChineseLanguage(languages, lastChineseLanguage(languages));
}

export function selectedPdfChineseLanguage(languages: AppLanguage[]): 'sc' | 'tc' | null {
  return lastChineseLanguage(languages);
}

export function newlySelectedPdfChineseLanguage(
  previousLanguages: AppLanguage[],
  nextLanguages: AppLanguage[],
): 'sc' | 'tc' | null {
  const previousChineseLanguages = new Set(previousLanguages.filter(isChinesePdfLanguage));

  return nextLanguages.find((language): language is 'sc' | 'tc' => (
    isChinesePdfLanguage(language) && !previousChineseLanguages.has(language)
  )) ?? null;
}

export function normalizePdfLanguagesForChange(value: unknown, previousValue: unknown): AppLanguage[] {
  const previousLanguages = uniquePdfLanguages(previousValue);
  const nextLanguages = uniquePdfLanguages(value);
  const preferredChineseLanguage =
    newlySelectedPdfChineseLanguage(previousLanguages, nextLanguages)
    ?? selectedPdfChineseLanguage(nextLanguages);

  return applyChineseLanguage(nextLanguages, preferredChineseLanguage);
}

export function alignPdfChineseLanguages(
  pdfLanguages: AppLanguage[],
  signatureLabelLanguages: AppLanguage[],
  preferredChineseLanguage?: 'sc' | 'tc' | null,
): Pick<PdfExportSettings, 'pdfLanguages' | 'signatureLabelLanguages'> {
  const chineseLanguage = preferredChineseLanguage ?? lastChineseLanguage(pdfLanguages) ?? lastChineseLanguage(signatureLabelLanguages);

  if (!chineseLanguage) {
    return { pdfLanguages, signatureLabelLanguages };
  }

  return {
    pdfLanguages: applyChineseLanguage(pdfLanguages, chineseLanguage),
    signatureLabelLanguages: applyChineseLanguage(signatureLabelLanguages, chineseLanguage),
  };
}

function uniquePdfLanguages(value: unknown): AppLanguage[] {
  if (!Array.isArray(value)) {
    return [...defaultPdfExportSettings.pdfLanguages];
  }

  const languages = value.filter(isAppLanguage);
  const uniqueLanguages = Array.from(new Set(languages));

  return uniqueLanguages.length > 0 ? uniqueLanguages : [...defaultPdfExportSettings.pdfLanguages];
}

function lastChineseLanguage(languages: AppLanguage[]): 'sc' | 'tc' | null {
  return [...languages]
    .reverse()
    .find(isChinesePdfLanguage) ?? null;
}

function isChinesePdfLanguage(language: AppLanguage): language is 'sc' | 'tc' {
  return language === 'sc' || language === 'tc';
}

function applyChineseLanguage(languages: AppLanguage[], chineseLanguage: 'sc' | 'tc' | null): AppLanguage[] {
  if (!chineseLanguage) {
    return languages;
  }

  const firstChineseIndex = languages.findIndex(isChinesePdfLanguage);
  if (firstChineseIndex < 0) {
    return languages;
  }

  const withoutChineseLanguages = languages.filter((language) => !isChinesePdfLanguage(language));

  return [
    ...withoutChineseLanguages.slice(0, firstChineseIndex),
    chineseLanguage,
    ...withoutChineseLanguages.slice(firstChineseIndex),
  ];
}

export function normalizeSignatureLabelMode(value: unknown): BudgetSignatureLabelMode {
  return value === 'signature' || value === 'confirmation' || value === 'confirmation_signature'
    ? value
    : defaultPdfExportSettings.signatureLabelMode;
}

export function normalizePdfExportSettings(
  settings: Partial<PdfExportSettings> | null | undefined,
): PdfExportSettings {
  const pdfLanguages = normalizePdfLanguages(settings?.pdfLanguages);
  const signatureLabelLanguages = normalizePdfLanguages(settings?.signatureLabelLanguages);
  const alignedLanguages = alignPdfChineseLanguages(pdfLanguages, signatureLabelLanguages);

  return {
    showWorkspace: settings?.showWorkspace === true,
    pdfLanguages: alignedLanguages.pdfLanguages,
    signatureLabelMode: normalizeSignatureLabelMode(settings?.signatureLabelMode),
    signatureLabelLanguages: alignedLanguages.signatureLabelLanguages,
  };
}
