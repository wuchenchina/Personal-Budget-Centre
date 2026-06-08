import { Alert, Form, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n } from '../../i18n';
import type {
  BudgetInstallmentPeriodUnit,
  BudgetType,
} from '../../types/budget';
import type { BudgetFormValues } from '../../types/forms';

interface BudgetInstallmentModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  error: string | null;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetInstallmentModal({
  form,
  open,
  error,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetInstallmentModalProps) {
  const { t } = useI18n();
  const budgetTypeOptions: Array<{ label: string; value: BudgetType }> = [
    { label: t('regularBudget'), value: 'regular' },
    { label: t('installmentBudget'), value: 'installment' },
  ];
  const periodUnitOptions: Array<{ label: string; value: BudgetInstallmentPeriodUnit }> = [
    { label: t('installmentPeriodDay'), value: 'day' },
    { label: t('installmentPeriodWeek'), value: 'week' },
    { label: t('installmentPeriodMonth'), value: 'month' },
    { label: t('installmentPeriodYear'), value: 'year' },
  ];

  return (
    <Modal
      destroyOnClose
      forceRender
      confirmLoading={confirmLoading}
      okText={t('save')}
      open={open}
      title={t('installmentOptions')}
      width="min(680px, calc(100vw - 40px))"
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BudgetFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-budget-installments"
        requiredMark={false}
      >
        <div className="installment-options-panel">
          <p>{t('installmentOptionsHelp')}</p>
          <div className="modal-form-grid">
            <Form.Item
              label={t('budgetType')}
              name="budgetType"
              rules={[{ required: true, message: t('selectBudgetType') }]}
            >
              <Select options={budgetTypeOptions} />
            </Form.Item>
            <Form.Item
              label={t('installmentPeriodUnit')}
              name="installmentPeriodUnit"
              rules={[{ required: true, message: t('selectInstallmentPeriodUnit') }]}
            >
              <Select options={periodUnitOptions} />
            </Form.Item>
          </div>
        </div>
      </Form>
    </Modal>
  );
}
