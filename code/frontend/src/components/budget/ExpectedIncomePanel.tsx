import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { updateBudgetIncome } from '../../api/budgets';
import { useI18n } from '../../i18n';
import type { AnnualSalary } from '../../types/auth';
import type { BudgetDetail, ExpectedIncome, ExpectedIncomeEntry } from '../../types/budget';
import { formatMoney } from '../../utils/currency';
import { annualSalaryAmount, incomeEntries } from '../../utils/expectedIncome';
import { ExpectedIncomeSummary } from './ExpectedIncomeSummary';

export function ExpectedIncomePanel({ budget, annualSalary, canWrite, onSaved }: {
  budget: BudgetDetail | null;
  annualSalary: AnnualSalary | null;
  canWrite: boolean;
  onSaved: (budget: BudgetDetail) => void;
}) {
  const { t } = useI18n();
  const [form] = Form.useForm<ExpectedIncome>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const watchedEntries = Form.useWatch('entries', { form, preserve: true });
  useEffect(() => {
    form.setFieldsValue({ entries: incomeEntries(budget?.expectedIncome) });
  }, [budget?.expectedIncome, form]);
  if (!budget) return null;
  const canUseAnnual = annualSalary?.currency === budget.baseCurrency && annualSalaryAmount(annualSalary) > 0;
  const previewEntries: ExpectedIncomeEntry[] = (watchedEntries ?? []).map((entry: ExpectedIncomeEntry) => {
    if (!canWrite) return entry;
    const validSnapshot = entry.annualCurrency === budget.baseCurrency && (entry.annualAmount ?? 0) > 0;
    const useProfile = entry.mode === 'auto' || entry.refreshAnnual || !validSnapshot;
    return { ...entry, annualAmount: useProfile ? (canUseAnnual ? annualSalaryAmount(annualSalary) : 0) : entry.annualAmount };
  });
  const save = async () => {
    try {
      await form.validateFields();
    } catch { return; }
    setSaving(true); setError(null); setSaved(false);
    try {
      const result = await updateBudgetIncome(budget.id, form.getFieldsValue(true));
      onSaved(result); setSaved(true);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : t('authFailed')); }
    finally { setSaving(false); }
  };
  const amountRules = [{ required: true, type: 'number' as const, min: 0, max: 1e12, message: t('incomeAmountRequired') }];
  return (
    <section className="project-panel income-panel" aria-label={t('expectedIncome')}>
      <div className="project-panel-heading"><div><strong>{t('expectedIncome')}</strong><span>{t('incomeEntriesHelp')}</span></div></div>
      <Alert showIcon type="warning" title={t('netSalaryNotice')} />
      {error ? <Alert showIcon type="error" title={error} /> : null}
      {saved ? <Alert showIcon type="success" title={t('incomeSaved')} /> : null}
      <Form form={form} layout="vertical" disabled={!canWrite || saving} onValuesChange={() => setSaved(false)}>
        <Form.List name="entries">
          {(fields, { add, remove }) => <>
            {fields.map((field) => {
              const entry = watchedEntries?.[field.name];
              const mode = entry?.mode ?? 'auto';
              const hasSnapshot = entry?.annualCurrency === budget.baseCurrency && (entry?.annualAmount ?? 0) > 0;
              return <div className="income-entry" key={field.key}>
                <Form.Item hidden name={[field.name, 'id']}><Input /></Form.Item>
                <Form.Item label={t('incomeSourceName')} name={[field.name, 'title']} rules={[{ required: true, whitespace: true, max: 160, message: t('incomeSourceRequired') }]}><Input maxLength={160} /></Form.Item>
                <Form.Item label={t('incomeBasis')} name={[field.name, 'mode']} extra={t('incomeBasisHelp')}>
                  <Select options={[
                    { label: t('salaryAuto'), value: 'auto' },
                    { label: t('netAnnualSalary'), value: 'annual', disabled: !canUseAnnual && !hasSnapshot },
                    { label: t('netMonthlySalary'), value: 'monthly' },
                    { label: t('netDailySalary'), value: 'daily' },
                    { label: t('incomeOneOff'), value: 'one_off' },
                  ]} />
                </Form.Item>
                <Form.Item hidden={mode !== 'monthly' && mode !== 'auto'} label={t('netMonthlySalary')} name={[field.name, 'monthlyAmount']} rules={amountRules}><InputNumber className="form-full-width" min={0} max={1e12} precision={2} suffix={budget.baseCurrency} /></Form.Item>
                <Form.Item hidden={mode !== 'daily'} label={t('netDailySalary')} name={[field.name, 'dailyAmount']} rules={amountRules}><InputNumber className="form-full-width" min={0} max={1e12} precision={2} suffix={budget.baseCurrency} /></Form.Item>
                <Form.Item hidden={mode !== 'daily'} label={t('salaryWorkdays')} name={[field.name, 'workdays']} extra={t('salaryWorkdaysHelp')} rules={[{ required: true, type: 'integer', min: 1, max: 31, message: t('salaryWorkdaysRequired') }]}><InputNumber className="form-full-width" min={1} max={31} precision={0} /></Form.Item>
                <Form.Item hidden={mode !== 'one_off'} label={t('incomeOneOffAmount')} name={[field.name, 'oneOffAmount']} rules={amountRules}><InputNumber className="form-full-width" min={0} max={1e12} precision={2} suffix={budget.baseCurrency} /></Form.Item>
                {mode === 'annual' ? <Form.Item name={[field.name, 'refreshAnnual']} valuePropName="checked"><Checkbox disabled={!canUseAnnual}>{t('refreshAnnualSalary')}</Checkbox></Form.Item> : null}
                {(mode === 'annual' || mode === 'auto') && (previewEntries[field.name]?.annualAmount ?? 0) > 0 ? <p>{t('netAnnualSalary')}: {formatMoney({ currency: budget.baseCurrency, amount: previewEntries[field.name]?.annualAmount ?? 0 })}</p> : null}
                {canWrite ? <Button danger icon={<Trash2 size={15} />} onClick={() => remove(field.name)} aria-label={t('delete')}>{t('delete')}</Button> : null}
              </div>;
            })}
            {canWrite ? <Space wrap className="income-actions">
              <Button icon={<Plus size={15} />} disabled={fields.length >= 100} onClick={() => add({ id: crypto.randomUUID(), title: '', mode: fields.length === 0 && canUseAnnual ? 'auto' : 'monthly', monthlyAmount: 0, dailyAmount: 0, workdays: 26, oneOffAmount: 0 })}>{t('addIncomeEntry')}</Button>
              <Button type="primary" loading={saving} onClick={() => void save()}>{t('save')}</Button>
            </Space> : null}
          </>}
        </Form.List>
      </Form>
      {canWrite ? <p>{t('incomeAnnualSnapshotHelp')}</p> : null}
      {!canUseAnnual && canWrite ? <p>{t('annualSalaryUnavailable')}</p> : null}
      <ExpectedIncomeSummary budget={{ ...budget, expectedIncome: { entries: canWrite ? previewEntries : incomeEntries(budget.expectedIncome) } }} embedded />
    </section>
  );
}
