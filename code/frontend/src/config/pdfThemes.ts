import type { PdfThemeKey } from '../types/budget';

export interface PdfThemeOption {
  key: PdfThemeKey;
  swatch: string;
  accent: string;
}

export const pdfThemeOptions: PdfThemeOption[] = [
  {
    key: 'classic',
    swatch: '#a4a4a4',
    accent: '#7e7e7e',
  },
  {
    key: 'hsbc',
    swatch: '#db0011',
    accent: '#111111',
  },
];

export function normalizePdfTheme(theme: string | null | undefined): PdfThemeKey {
  if (theme === 'statement_red') {
    return 'hsbc';
  }

  return pdfThemeOptions.some((option) => option.key === theme)
    ? (theme as PdfThemeKey)
    : 'classic';
}
