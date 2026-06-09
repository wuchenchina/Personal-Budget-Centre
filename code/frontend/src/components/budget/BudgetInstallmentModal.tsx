import { Alert, Button, Checkbox, Empty, Form, Modal, Popconfirm, Radio, Select, Tabs, Timeline } from 'antd';
import type { FormInstance } from 'antd';
import { RefreshCcw, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import type {
  BudgetDetail,
  BudgetInstallmentPeriodUnit,
} from '../../types/budget';
import type { BudgetFormValues } from '../../types/forms';

interface BudgetInstallmentModalProps {
  form: FormInstance<BudgetFormValues>;
  selectedBudget: BudgetDetail | null;
  open: boolean;
  error: string | null;
  canWriteBudgets: boolean;
  confirmLoading: boolean;
  isEntrySaving: boolean;
  onCancel: () => void;
  onClearHistory: () => void;
  onOk: () => void;
  onResetAmounts: () => void;
}

export function BudgetInstallmentModal({
  form,
  selectedBudget,
  open,
  error,
  canWriteBudgets,
  confirmLoading,
  isEntrySaving,
  onCancel,
  onClearHistory,
  onOk,
  onResetAmounts,
}: BudgetInstallmentModalProps) {
  const { t } = useI18n();
  const isInstallmentBudget = Form.useWatch('budgetType', form) === 'installment';
  const installmentDisplayMode = Form.useWatch('installmentDisplayMode', form);
  const resettableItemCount = (selectedBudget?.items ?? []).filter(
    (item) => item.installmentConfig.enabled,
  ).length;
  const canResetAmounts = installmentDisplayMode === 'overall' || resettableItemCount > 0;
  const periodUnitOptions: Array<{ label: string; value: BudgetInstallmentPeriodUnit }> = [
    { label: t('installmentPeriodDay'), value: 'day' },
    { label: t('installmentPeriodWeek'), value: 'week' },
    { label: t('installmentPeriodMonth'), value: 'month' },
    { label: t('installmentPeriodYear'), value: 'year' },
  ];
  const displayModeOptions = [
    { label: t('installmentDisplayModeItem'), value: 'item' },
    { label: t('installmentDisplayModeOverall'), value: 'overall' },
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
        <Tabs
          items={[
            {
              key: 'settings',
              label: t('installmentSettings'),
              children: (
                <div className="installment-options-panel">
                  <p>{t('installmentOptionsHelp')}</p>
                  <Form.Item name="budgetType" hidden>
                    <input />
                  </Form.Item>
                  <Checkbox
                    checked={isInstallmentBudget}
                    onChange={(event) => {
                      form.setFieldValue('budgetType', event.target.checked ? 'installment' : 'regular');
                    }}
                  >
                    {t('installmentBudget')}
                  </Checkbox>
                  {isInstallmentBudget ? (
                    <div className="modal-form-grid installment-period-settings">
                      <Form.Item
                        label={t('installmentDisplayMode')}
                        name="installmentDisplayMode"
                        rules={[{ required: true, message: t('selectInstallmentDisplayMode') }]}
                      >
                        <Radio.Group
                          block
                          optionType="button"
                          options={displayModeOptions}
                        />
                      </Form.Item>
                      <Form.Item
                        label={t('installmentPeriodUnit')}
                        name="installmentPeriodUnit"
                        rules={[{ required: true, message: t('selectInstallmentPeriodUnit') }]}
                      >
                        <Select options={periodUnitOptions} />
                      </Form.Item>
                    </div>
                  ) : null}
                  <div className="installment-option-actions">
                    <Popconfirm
                      title={t('resetInstallmentAmountsTitle')}
                      okText={t('reset')}
                      cancelText={t('cancel')}
                      onConfirm={onResetAmounts}
                    >
                      <Button
                        disabled={!canWriteBudgets || !isInstallmentBudget || !canResetAmounts || isEntrySaving}
                        icon={<RefreshCcw size={14} />}
                        loading={isEntrySaving}
                      >
                        {t('resetInstallmentAmounts')}
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              ),
            },
            {
              key: 'history',
              label: t('installmentHistory'),
              children: (
                <InstallmentHistory
                  canWriteBudgets={canWriteBudgets}
                  isSaving={isEntrySaving}
                  selectedBudget={selectedBudget}
                  onClearHistory={onClearHistory}
                />
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}

function InstallmentHistory({
  canWriteBudgets,
  isSaving,
  selectedBudget,
  onClearHistory,
}: {
  canWriteBudgets: boolean;
  isSaving: boolean;
  selectedBudget: BudgetDetail | null;
  onClearHistory: () => void;
}) {
  const { t } = useI18n();
  const versions = (selectedBudget?.items ?? [])
    .flatMap((item) =>
      item.installmentConfig.versions.map((version) => ({
        ...version,
        category: item.category ?? item.label,
        currency: item.budget.currency,
      })),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (versions.length === 0) {
    return <Empty description={t('installmentHistoryEmpty')} />;
  }

  return (
    <div className="installment-history-panel">
      <div className="installment-history-toolbar">
        <span>{t('installmentHistoryCount', { count: versions.length })}</span>
        <Popconfirm
          title={t('clearInstallmentHistoryTitle')}
          okText={t('delete')}
          cancelText={t('cancel')}
          okButtonProps={{ danger: true }}
          onConfirm={onClearHistory}
        >
          <Button
            danger
            disabled={!canWriteBudgets || isSaving}
            icon={<Trash2 size={14} />}
            loading={isSaving}
            size="small"
          >
            {t('clearInstallmentHistory')}
          </Button>
        </Popconfirm>
      </div>
      <Timeline
        items={versions.map((version) => ({
          key: version.id,
          label: version.createdAt ? new Date(version.createdAt).toLocaleString() : undefined,
          children: (
            <div className="installment-history-item">
              <strong>{version.category}</strong>
              <span>{version.label}</span>
              <small>
                {version.periodAmounts.length} periods
                {version.periodRemarks.some((remark) => remark !== '') ? ' · remarks' : ''}
                {version.totalAmount === null ? '' : ` · ${version.currency} ${version.totalAmount.toFixed(2)}`}
              </small>
            </div>
          ),
        }))}
      />
    </div>
  );
}
