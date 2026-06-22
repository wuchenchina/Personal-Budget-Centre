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
  if (!Array.isArray(value)) {
    return [...defaultPdfExportSettings.pdfLanguages];
  }

  const languages = value.filter(isAppLanguage);
  const uniqueLanguages = Array.from(new Set(languages));

  return uniqueLanguages.length > 0 ? uniqueLanguages : [...defaultPdfExportSettings.pdfLanguages];
}

export function normalizeSignatureLabelMode(value: unknown): BudgetSignatureLabelMode {
  return value === 'signature' || value === 'confirmation' || value === 'confirmation_signature'
    ? value
    : defaultPdfExportSettings.signatureLabelMode;
}

export function normalizePdfExportSettings(
  settings: Partial<PdfExportSettings> | null | undefined,
): PdfExportSettings {
  return {
    showWorkspace: settings?.showWorkspace === true,
    pdfLanguages: normalizePdfLanguages(settings?.pdfLanguages),
    signatureLabelMode: normalizeSignatureLabelMode(settings?.signatureLabelMode),
    signatureLabelLanguages: normalizePdfLanguages(settings?.signatureLabelLanguages),
  };
}
