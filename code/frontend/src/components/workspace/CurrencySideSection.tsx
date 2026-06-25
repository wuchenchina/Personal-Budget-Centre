import { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Popconfirm, Select, Space, Tag } from 'antd';
import { Coins, Plus, Trash2 } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import { useI18n } from '../../i18n';
import { buildCurrencyOptions, renderCurrencyOption } from '../../utils/currencyOptions';

interface CurrencySideSectionProps {
  isSystemAdmin: boolean;
  operations: OperationsController;
}

export function CurrencySideSection({ isSystemAdmin, operations }: CurrencySideSectionProps) {
  const { t } = useI18n();
  const existingCodes = useMemo(
    () => new Set(operations.currencies.map((currency) => currency.code)),
    [operations.currencies],
  );
  const availableCatalog = useMemo(
    () => operations.currencyPresets.filter((currency) => !existingCodes.has(currency.code)),
    [existingCodes, operations.currencyPresets],
  );
  const availableCatalogOptions = useMemo(
    () => buildCurrencyOptions(availableCatalog),
    [availableCatalog],
  );
  const [selectedCode, setSelectedCode] = useState<string | undefined>(
    availableCatalog[0]?.code,
  );
  const selectedCatalogCurrency = availableCatalog.find((currency) => currency.code === selectedCode);
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customDecimalPlaces, setCustomDecimalPlaces] = useState(2);

  useEffect(() => {
    if (selectedCode === undefined || existingCodes.has(selectedCode)) {
      let isMounted = true;

      queueMicrotask(() => {
        if (isMounted) {
          setSelectedCode(availableCatalog[0]?.code);
        }
      });

      return () => {
        isMounted = false;
      };
    }

    return undefined;
  }, [availableCatalog, existingCodes, selectedCode]);

  const handleAddCatalogCurrency = async () => {
    if (selectedCatalogCurrency === undefined) {
      return;
    }
    const saved = await operations.saveCurrency({ ...selectedCatalogCurrency, source: 'catalog' });
    if (saved) {
      const nextCode = availableCatalog.find((currency) => currency.code !== selectedCatalogCurrency.code)?.code;
      setSelectedCode(nextCode);
    }
  };

  const canCreateCustomCurrency =
    /^[A-Z]{3}$/.test(customCode)
    && customName.trim() !== ''
    && customDecimalPlaces >= 0
    && customDecimalPlaces <= 6
    && !existingCodes.has(customCode);

  const handleCreateCustomCurrency = async () => {
    if (!canCreateCustomCurrency) {
      return;
    }
    const saved = await operations.saveCurrency({
      code: customCode,
      name: customName,
      symbol: customSymbol || customCode,
      decimalPlaces: customDecimalPlaces,
      source: 'manual',
    });
    if (saved) {
      setCustomCode('');
      setCustomName('');
      setCustomSymbol('');
      setCustomDecimalPlaces(2);
    }
  };

  return (
    <div className="side-section currency-directory-section">
      <div className="side-title">
        <Coins size={16} />
        <span>{t('currencyDirectory')}</span>
      </div>
      <p className="side-description">{t('currencyDirectoryDesc')}</p>

      <Space className="currency-chip-row" size={4} wrap>
        {operations.currencies.length === 0 ? (
          <span className="muted-inline">{t('noCurrencies')}</span>
        ) : (
          operations.currencies.map((currency) => (
            <span className="currency-chip" key={currency.code}>
              <Tag>{currency.code}</Tag>
              {isSystemAdmin ? (
                <Popconfirm
                  title={t('deleteCurrency')}
                  description={t('deleteCurrencyDescription')}
                  okText={t('delete')}
                  cancelText={t('cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void operations.removeCurrency(currency.id)}
                >
                  <Button
                    aria-label={`${t('deleteCurrency')} ${currency.code}`}
                    danger
                    icon={<Trash2 size={12} />}
                    loading={operations.deletingCurrencyId === currency.id}
                    size="small"
                    type="text"
                  />
                </Popconfirm>
              ) : null}
            </span>
          ))
        )}
      </Space>

      {isSystemAdmin ? (
        <>
          <div className="currency-reserve-row">
            <Select
              className="currency-reserve-select"
              disabled={availableCatalog.length === 0}
              optionFilterProp="label"
              optionLabelProp="value"
              optionRender={renderCurrencyOption}
              options={availableCatalogOptions}
              placeholder={t('currencyReservePlaceholder')}
              showSearch
              size="small"
              value={selectedCode}
              onChange={setSelectedCode}
            />
            <Button
              disabled={selectedCatalogCurrency === undefined}
              icon={<Plus size={13} />}
              loading={operations.isCurrencySaving}
              size="small"
              onClick={() => void handleAddCatalogCurrency()}
            >
              {t('addCurrency')}
            </Button>
          </div>

          <div className="currency-create-row">
            <Input
              aria-label={t('currencyCode')}
              maxLength={3}
              placeholder={t('currencyCode')}
              size="small"
              value={customCode}
              onChange={(event) => setCustomCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onPressEnter={() => void handleCreateCustomCurrency()}
            />
            <Input
              aria-label={t('currencyName')}
              maxLength={120}
              placeholder={t('currencyName')}
              size="small"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              onPressEnter={() => void handleCreateCustomCurrency()}
            />
            <Input
              aria-label={t('currencySymbol')}
              maxLength={16}
              placeholder={t('currencySymbol')}
              size="small"
              value={customSymbol}
              onChange={(event) => setCustomSymbol(event.target.value)}
              onPressEnter={() => void handleCreateCustomCurrency()}
            />
            <InputNumber
              aria-label={t('decimalPlaces')}
              max={6}
              min={0}
              precision={0}
              size="small"
              value={customDecimalPlaces}
              onChange={(value) => setCustomDecimalPlaces(typeof value === 'number' ? value : 2)}
            />
            <Button
              disabled={!canCreateCustomCurrency}
              icon={<Plus size={13} />}
              loading={operations.isCurrencySaving}
              size="small"
              onClick={() => void handleCreateCustomCurrency()}
            >
              {t('addCustomCurrency')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
