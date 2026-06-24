import { normalizePdfTheme } from '../config/pdfThemes';
import type { PdfExportSettings } from '../types/auth';
import type { PdfThemeKey } from '../types/budget';
import { normalizePdfExportSettings } from './pdfExportSettings';

export interface BudgetPdfExportSettingsValue extends PdfExportSettings {
  pdfTheme: PdfThemeKey;
}

export function budgetPdfExportSettingsValue(
  pdfTheme: PdfThemeKey | string | null | undefined,
  settings: Partial<PdfExportSettings> | null | undefined,
): BudgetPdfExportSettingsValue {
  const normalizedSettings = normalizePdfExportSettings(settings);

  return {
    ...normalizedSettings,
    pdfTheme: normalizePdfTheme(pdfTheme),
  };
}
