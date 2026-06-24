export interface CurrencyCatalogItem {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

export const localCurrencyCatalog: CurrencyCatalogItem[] = [
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2 },
  { code: 'BND', name: 'Brunei Dollar', symbol: 'B$', decimalPlaces: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2 },
  { code: 'CNH', name: 'Offshore Chinese Yuan', symbol: 'CNH¥', decimalPlaces: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2 },
  { code: 'DKK', name: 'Danish Krone', symbol: 'DKK', decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimalPlaces: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$', decimalPlaces: 2 },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'NOK', decimalPlaces: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimalPlaces: 2 },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'SEK', decimalPlaces: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalPlaces: 2 },
  { code: 'USD', name: 'United States Dollar', symbol: '$', decimalPlaces: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalPlaces: 2 },
];
