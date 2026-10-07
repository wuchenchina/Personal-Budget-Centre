import { Alert, Checkbox, Form, InputNumber, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '../../i18n';
import type { ProfileFormValues } from '../../types/forms';
import { annualSalaryAmount } from '../../utils/expectedIncome';
import { formatMoney } from '../../utils/currency';

export function AnnualSalaryFields({ form, currencyOptions }: {
  form: FormInstance<ProfileFormValues>;
  currencyOptions: Array<{ label: string; value: string }>;
}) {
  const { t } = useI18n();
  const enabled = Form.useWatch('annualSalaryEnabled', form);
  const salary = Form.useWatch('annualSalary', form);
  return (
    <div className="income-settings">
      <Form.Item name="annualSalaryEnabled" valuePropName="checked">
        <Checkbox>{t('annualSalarySettings')}</Checkbox>
      </Form.Item>
      {enabled ? <>
        <Alert type="warning" showIcon title={t('netSalaryNotice')} />
        <Form.Item label={t('salaryCurrency')} name={['annualSalary', 'currency']} rules={[{ required: true, message: t('selectBaseCurrency') }]}>
          <Select options={currencyOptions} showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item label={t('annualSalaryMethod')} name={['annualSalary', 'mode']}>
          <Select options={[{ label: t('annualSalaryTotal'), value: 'total' }, { label: t('annualSalaryMonthly'), value: 'monthly' }]} />
        </Form.Item>
        <Form.Item label={salary?.mode === 'monthly' ? t('netMonthlySalary') : t('annualSalaryTotal')} name={['annualSalary', 'amount']}
          rules={[{ required: true, type: 'number', min: 0.01, max: 1e12, message: t('salaryAmountRequired') }]}>
          <InputNumber min={0.01} max={1e12} precision={2} className="form-full-width" />
        </Form.Item>
        <Form.Item label={t('salaryPaymentsPerYear')} name={['annualSalary', 'paymentsPerYear']} hidden={salary?.mode !== 'monthly'} extra={t('salaryPaymentsHelp')}
          rules={[{ required: true, type: 'integer', min: 1, max: 100, message: t('salaryPaymentsRequired') }]}>
          <InputNumber min={1} max={100} precision={0} className="form-full-width" />
        </Form.Item>
        <p>{t('netAnnualSalary')}: {formatMoney({ currency: salary?.currency ?? '', amount: annualSalaryAmount(salary) })}</p>
        <p>{t('annualSalaryProfileHelp')}</p>
      </> : null}
    </div>
  );
}
