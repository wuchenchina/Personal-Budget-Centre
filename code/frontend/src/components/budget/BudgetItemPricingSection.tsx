import { Checkbox, Form, InputNumber } from 'antd';
import { useI18n } from '../../i18n';
import type { CurrencyCode } from '../../types/budget';

interface BudgetItemPricingSectionProps {
  budgetCurrency: CurrencyCode;
  enabled: boolean;
  pricingTotal: number | null;
}

export function BudgetItemPricingSection({
  budgetCurrency,
  enabled,
  pricingTotal,
}: BudgetItemPricingSectionProps) {
  const { t } = useI18n();

  if (!enabled) {
    return null;
  }

  return (
    <div className="pricing-config-panel installment-config-panel">
      <Form.Item name={['pricingConfig', 'enabled']} valuePropName="checked">
        <Checkbox>{t('enableUnitPricing')}</Checkbox>
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(previous, current) =>
        previous.pricingConfig?.enabled !== current.pricingConfig?.enabled
      }
      >
        {({ getFieldValue }) => (
          getFieldValue(['pricingConfig', 'enabled']) === true ? (
            <>
              <div className="installment-config-copy">
                <strong>{t('unitPricingTitle')}</strong>
                <span>{t('unitPricingHelp')}</span>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('unitPrice')}
                  name={['pricingConfig', 'unitPrice']}
                  rules={[
                    { required: true, message: t('unitPriceRequired') },
                    { type: 'number', min: 0, message: t('unitPriceMin') },
                  ]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    min={0}
                    precision={2}
                    step={100}
                  />
                </Form.Item>
                <Form.Item
                  label={t('quantity')}
                  name={['pricingConfig', 'quantity']}
                  rules={[
                    { required: true, message: t('quantityRequired') },
                    { type: 'number', min: 0, message: t('quantityMin') },
                  ]}
                >
                  <InputNumber
                    className="form-full-width"
                    min={0}
                    precision={2}
                    step={1}
                  />
                </Form.Item>
              </div>
              <div className="installment-config-summary">
                <span>{t('totalPrice')}</span>
                <strong>
                  {pricingTotal === null
                    ? `${budgetCurrency ?? t('currency')} --`
                    : `${budgetCurrency ?? t('currency')} ${pricingTotal.toFixed(2)}`}
                </strong>
                <span>{t('budgetAmount')}</span>
                <strong>
                  {pricingTotal === null
                    ? '--'
                    : t('unitPricingSyncTarget')}
                </strong>
              </div>
            </>
          ) : null
        )}
      </Form.Item>
    </div>
  );
}
