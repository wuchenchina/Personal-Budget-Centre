import { Button, Input, InputNumber, Select } from 'antd';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { localCurrencyCatalog } from '../../config/currencyCatalog';
import { useI18n } from '../../i18n';
import type { Currency, CurrencyCode } from '../../types/budget';

interface CurrencySelectWithQuickAddProps {
  currencies: Currency[];
  options: Array<{ label: string; value: CurrencyCode }>;
  value?: CurrencyCode;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange?: (value: CurrencyCode | undefined) => void;
  onSaveCurrency: (input: {
    code: string;
    name: string;
    symbol?: string;
    decimalPlaces: number;
  }) => Promise<boolean>;
}

export function CurrencySelectWithQuickAdd({
  allowClear,
  currencies,
  disabled,
  onChange,
  onSaveCurrency,
  options,
  placeholder,
  value,
}: CurrencySelectWithQuickAddProps) {
  const { t } = useI18n();
  const existingCodes = useMemo(
    () => new Set(currencies.map((currency) => currency.code)),
    [currencies],
  );
  const catalogOptions = useMemo(
    () => localCurrencyCatalog.filter((currency) => !existingCodes.has(currency.code)),
    [existingCodes],
  );
  const [selectedCatalogCode, setSelectedCatalogCode] = useState<string | undefined>(catalogOptions[0]?.code);
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customDecimalPlaces, setCustomDecimalPlaces] = useState(2);
  const [saving, setSaving] = useState(false);
  const selectedCatalogCurrency = catalogOptions.find((currency) => currency.code === selectedCatalogCode);
  const canCreateCustomCurrency =
    /^[A-Z]{3}$/.test(customCode)
    && customName.trim() !== ''
    && customDecimalPlaces >= 0
    && customDecimalPlaces <= 6;

  const saveAndSelect = async (input: {
    code: string;
    name: string;
    symbol?: string;
    decimalPlaces: number;
  }) => {
    setSaving(true);
    try {
      const saved = await onSaveCurrency(input);
      if (saved) {
        onChange?.(input.code as CurrencyCode);
      }
      return saved;
    } finally {
      setSaving(false);
    }
  };

  const handleAddCatalogCurrency = async () => {
    if (selectedCatalogCurrency === undefined) {
      return;
    }
    const saved = await saveAndSelect(selectedCatalogCurrency);
    if (saved) {
      setSelectedCatalogCode(catalogOptions.find((currency) => currency.code !== selectedCatalogCurrency.code)?.code);
    }
  };

  const handleCreateCustomCurrency = async () => {
    if (!canCreateCustomCurrency) {
      return;
    }
    const saved = await saveAndSelect({
      code: customCode,
      name: customName.trim(),
      symbol: customSymbol.trim() || customCode,
      decimalPlaces: customDecimalPlaces,
    });
    if (saved) {
      setCustomCode('');
      setCustomName('');
      setCustomSymbol('');
      setCustomDecimalPlaces(2);
    }
  };

  return (
    <div className="currency-select-quick-add">
      <Select
        allowClear={allowClear}
        disabled={disabled}
        notFoundContent={t('noCurrencies')}
        optionFilterProp="label"
        options={options}
        placeholder={placeholder}
        showSearch
        value={value}
        onChange={onChange}
      />
      <div className="currency-quick-add-row">
        <Select
          disabled={catalogOptions.length === 0}
          optionFilterProp="label"
          options={catalogOptions.map((currency) => ({
            label: `${currency.code} ${currency.name}`,
            value: currency.code,
          }))}
          placeholder={t('currencyReservePlaceholder')}
          showSearch
          size="small"
          value={selectedCatalogCode}
          onChange={setSelectedCatalogCode}
        />
        <Button
          disabled={selectedCatalogCurrency === undefined}
          icon={<Plus size={13} />}
          loading={saving}
          size="small"
          onClick={() => void handleAddCatalogCurrency()}
        >
          {t('addCurrency')}
        </Button>
      </div>
      <div className="currency-quick-add-row currency-quick-add-custom">
        <Input
          maxLength={3}
          placeholder={t('currencyCode')}
          size="small"
          value={customCode}
          onChange={(event) => setCustomCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
        <Input
          maxLength={120}
          placeholder={t('currencyName')}
          size="small"
          value={customName}
          onChange={(event) => setCustomName(event.target.value)}
        />
        <Input
          maxLength={16}
          placeholder={t('currencySymbol')}
          size="small"
          value={customSymbol}
          onChange={(event) => setCustomSymbol(event.target.value)}
        />
        <InputNumber
          max={6}
          min={0}
          precision={0}
          size="small"
          value={customDecimalPlaces}
          onChange={(nextValue) => setCustomDecimalPlaces(typeof nextValue === 'number' ? nextValue : 2)}
        />
        <Button
          disabled={!canCreateCustomCurrency}
          icon={<Plus size={13} />}
          loading={saving}
          size="small"
          onClick={() => void handleCreateCustomCurrency()}
        >
          {t('addCustomCurrency')}
        </Button>
      </div>
    </div>
  );
}
