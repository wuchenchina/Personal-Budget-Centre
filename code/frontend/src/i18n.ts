import enUS from 'antd/es/locale/en_US';
import zhCN from 'antd/es/locale/zh_CN';
import zhTW from 'antd/es/locale/zh_TW';

export type AppLanguage = 'en' | 'sc' | 'tc';

export const languageOptions: Array<{ label: string; value: AppLanguage }> = [
  { label: 'EN', value: 'en' },
  { label: '简体', value: 'sc' },
  { label: '繁體', value: 'tc' },
];

export const antdLocales = {
  en: enUS,
  sc: zhCN,
  tc: zhTW,
};

export const languageLabels: Record<AppLanguage, string> = {
  en: 'English',
  sc: '简体中文',
  tc: '繁體中文',
};

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  if (value === 'en' || value === 'sc' || value === 'tc') {
    return value;
  }

  if (value?.toLowerCase().startsWith('en')) {
    return 'en';
  }

  if (value?.toLowerCase().includes('hans') || value?.toLowerCase().includes('cn')) {
    return 'sc';
  }

  return 'tc';
}
