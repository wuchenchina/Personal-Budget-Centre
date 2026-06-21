import { createContext, useContext } from 'react';
import {
  enAntdLocale,
  enApiErrorMessages,
  enBudgetShareRoleLabels,
  enBudgetStatusLabels,
  enCurrencyRateSourceLabels,
  enDictionary,
  enLanguageLabel,
  enLanguageOption,
  enPrincipalTypeLabels,
  enRoleLabels,
  enUserStatusLabels,
  enVisibilityLabels,
  enWorkspaceTypeLabels,
} from './en';
import {
  deAntdLocale,
  deApiErrorMessages,
  deBudgetShareRoleLabels,
  deBudgetStatusLabels,
  deCurrencyRateSourceLabels,
  deDictionary,
  deLanguageLabel,
  deLanguageOption,
  dePrincipalTypeLabels,
  deRoleLabels,
  deUserStatusLabels,
  deVisibilityLabels,
  deWorkspaceTypeLabels,
} from './de';
import {
  frAntdLocale,
  frApiErrorMessages,
  frBudgetShareRoleLabels,
  frBudgetStatusLabels,
  frCurrencyRateSourceLabels,
  frDictionary,
  frLanguageLabel,
  frLanguageOption,
  frPrincipalTypeLabels,
  frRoleLabels,
  frUserStatusLabels,
  frVisibilityLabels,
  frWorkspaceTypeLabels,
} from './fr';
import {
  jaAntdLocale,
  jaApiErrorMessages,
  jaBudgetShareRoleLabels,
  jaBudgetStatusLabels,
  jaCurrencyRateSourceLabels,
  jaDictionary,
  jaLanguageLabel,
  jaLanguageOption,
  jaPrincipalTypeLabels,
  jaRoleLabels,
  jaUserStatusLabels,
  jaVisibilityLabels,
  jaWorkspaceTypeLabels,
} from './ja';
import {
  ruAntdLocale,
  ruApiErrorMessages,
  ruBudgetShareRoleLabels,
  ruBudgetStatusLabels,
  ruCurrencyRateSourceLabels,
  ruDictionary,
  ruLanguageLabel,
  ruLanguageOption,
  ruPrincipalTypeLabels,
  ruRoleLabels,
  ruUserStatusLabels,
  ruVisibilityLabels,
  ruWorkspaceTypeLabels,
} from './ru';
import {
  scAntdLocale,
  scApiErrorMessages,
  scBudgetShareRoleLabels,
  scBudgetStatusLabels,
  scCurrencyRateSourceLabels,
  scDictionary,
  scLanguageLabel,
  scLanguageOption,
  scPrincipalTypeLabels,
  scRoleLabels,
  scUserStatusLabels,
  scVisibilityLabels,
  scWorkspaceTypeLabels,
} from './sc';
import {
  tcAntdLocale,
  tcApiErrorMessages,
  tcBudgetShareRoleLabels,
  tcBudgetStatusLabels,
  tcCurrencyRateSourceLabels,
  tcDictionary,
  tcLanguageLabel,
  tcLanguageOption,
  tcPrincipalTypeLabels,
  tcRoleLabels,
  tcUserStatusLabels,
  tcVisibilityLabels,
  tcWorkspaceTypeLabels,
} from './tc';
import type { AppLanguage, I18nValues } from './types';

export type { AppLanguage, I18nValues, WorkspaceType } from './types';

export type I18nKey = keyof typeof enDictionary;

export const languageOptions = [
  enLanguageOption,
  scLanguageOption,
  tcLanguageOption,
  jaLanguageOption,
  frLanguageOption,
  ruLanguageOption,
  deLanguageOption,
];

export const languageLabels = {
  en: enLanguageLabel,
  sc: scLanguageLabel,
  tc: tcLanguageLabel,
  ja: jaLanguageLabel,
  fr: frLanguageLabel,
  ru: ruLanguageLabel,
  de: deLanguageLabel,
} satisfies Record<AppLanguage, string>;

export const antdLocales = {
  en: enAntdLocale,
  sc: scAntdLocale,
  tc: tcAntdLocale,
  ja: jaAntdLocale,
  fr: frAntdLocale,
  ru: ruAntdLocale,
  de: deAntdLocale,
};

export const dictionaries: Record<AppLanguage, Record<I18nKey, string>> = {
  en: enDictionary,
  sc: scDictionary,
  tc: tcDictionary,
  ja: jaDictionary,
  fr: frDictionary,
  ru: ruDictionary,
  de: deDictionary,
};

export const i18nDictionaries = dictionaries;

export const roleLabelsByLanguage = {
  en: enRoleLabels,
  sc: scRoleLabels,
  tc: tcRoleLabels,
  ja: jaRoleLabels,
  fr: frRoleLabels,
  ru: ruRoleLabels,
  de: deRoleLabels,
};

export const budgetShareRoleLabelsByLanguage = {
  en: enBudgetShareRoleLabels,
  sc: scBudgetShareRoleLabels,
  tc: tcBudgetShareRoleLabels,
  ja: jaBudgetShareRoleLabels,
  fr: frBudgetShareRoleLabels,
  ru: ruBudgetShareRoleLabels,
  de: deBudgetShareRoleLabels,
};

export const budgetStatusLabelsByLanguage = {
  en: enBudgetStatusLabels,
  sc: scBudgetStatusLabels,
  tc: tcBudgetStatusLabels,
  ja: jaBudgetStatusLabels,
  fr: frBudgetStatusLabels,
  ru: ruBudgetStatusLabels,
  de: deBudgetStatusLabels,
};

export const visibilityLabelsByLanguage = {
  en: enVisibilityLabels,
  sc: scVisibilityLabels,
  tc: tcVisibilityLabels,
  ja: jaVisibilityLabels,
  fr: frVisibilityLabels,
  ru: ruVisibilityLabels,
  de: deVisibilityLabels,
};

export const principalTypeLabelsByLanguage = {
  en: enPrincipalTypeLabels,
  sc: scPrincipalTypeLabels,
  tc: tcPrincipalTypeLabels,
  ja: jaPrincipalTypeLabels,
  fr: frPrincipalTypeLabels,
  ru: ruPrincipalTypeLabels,
  de: dePrincipalTypeLabels,
};

export const userStatusLabelsByLanguage = {
  en: enUserStatusLabels,
  sc: scUserStatusLabels,
  tc: tcUserStatusLabels,
  ja: jaUserStatusLabels,
  fr: frUserStatusLabels,
  ru: ruUserStatusLabels,
  de: deUserStatusLabels,
};

export const workspaceTypeLabelsByLanguage = {
  en: enWorkspaceTypeLabels,
  sc: scWorkspaceTypeLabels,
  tc: tcWorkspaceTypeLabels,
  ja: jaWorkspaceTypeLabels,
  fr: frWorkspaceTypeLabels,
  ru: ruWorkspaceTypeLabels,
  de: deWorkspaceTypeLabels,
};

export const currencyRateSourceLabelsByLanguage = {
  en: enCurrencyRateSourceLabels,
  sc: scCurrencyRateSourceLabels,
  tc: tcCurrencyRateSourceLabels,
  ja: jaCurrencyRateSourceLabels,
  fr: frCurrencyRateSourceLabels,
  ru: ruCurrencyRateSourceLabels,
  de: deCurrencyRateSourceLabels,
};

export const apiErrorMessagesByLanguage: Record<AppLanguage, Record<string, string>> = {
  en: enApiErrorMessages,
  sc: scApiErrorMessages,
  tc: tcApiErrorMessages,
  ja: jaApiErrorMessages,
  fr: frApiErrorMessages,
  ru: ruApiErrorMessages,
  de: deApiErrorMessages,
};

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  if (
    value === 'en'
    || value === 'sc'
    || value === 'tc'
    || value === 'ja'
    || value === 'fr'
    || value === 'ru'
    || value === 'de'
  ) {
    return value;
  }

  const normalized = value?.toLowerCase() ?? '';
  if (normalized.startsWith('en')) {
    return 'en';
  }

  if (normalized.startsWith('ja') || normalized.startsWith('jp')) {
    return 'ja';
  }

  if (normalized.startsWith('fr')) {
    return 'fr';
  }

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  if (normalized.startsWith('de')) {
    return 'de';
  }

  if (normalized.includes('hans') || normalized.includes('cn')) {
    return 'sc';
  }

  return 'tc';
}

function interpolate(template: string, values?: I18nValues): string {
  if (values === undefined) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (matched, key: string) => {
    const value = values[key];

    return value === null || value === undefined ? matched : String(value);
  });
}

export function translate(language: AppLanguage, key: I18nKey, values?: I18nValues): string {
  return interpolate(dictionaries[language][key] ?? dictionaries.en[key] ?? key, values);
}

export function currentLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return 'tc';
  }

  return normalizeLanguage(
    window.localStorage.getItem('budgetCentre.language') ?? window.navigator.language,
  );
}

export function translateCurrent(key: I18nKey, values?: I18nValues): string {
  return translate(currentLanguage(), key, values);
}

interface I18nContextValue {
  language: AppLanguage;
  t: (key: I18nKey, values?: I18nValues) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  language: 'tc',
  t: (key, values) => translate('tc', key, values),
});

export function useI18n() {
  return useContext(I18nContext);
}
