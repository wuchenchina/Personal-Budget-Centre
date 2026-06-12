import { Alert, Button, Checkbox, DatePicker, Form, Input, Modal, Radio, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import {
  useI18n,
  visibilityLabelsByLanguage,
} from '../../i18n';
import type { Visibility } from '../../types/budget';
import type { BudgetFormValues } from '../../types/forms';
import { defaultBudgetTitle } from '../../utils/budgetTitle';

const { RangePicker } = DatePicker;

interface BudgetCreateModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  isEditing: boolean;
  error: string | null;
  workspaceOptions: Array<{ label: string; value: number }>;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetCreateModal({
  form,
  open,
  isEditing,
  error,
  workspaceOptions,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetCreateModalProps) {
  const { language, t } = useI18n();
  const dateRange = Form.useWatch('dateRange', form);
  const participantMode = Form.useWatch('participantMode', form) ?? 'solo';
  const visibilityOptions: Array<{ label: string; value: Visibility }> = [
    { label: visibilityLabelsByLanguage[language].private, value: 'private' },
    { label: visibilityLabelsByLanguage[language].workspace, value: 'workspace' },
    { label: visibilityLabelsByLanguage[language].custom, value: 'custom' },
  ];
  const handleResetTitle = () => {
    const currentDateRange = form.getFieldValue('dateRange') ?? dateRange ?? null;
    form.setFieldValue('title', defaultBudgetTitle(currentDateRange));
  };

  return (
    <Modal
      destroyOnClose
      forceRender
      confirmLoading={confirmLoading}
      okText={isEditing ? t('save') : t('create')}
      open={open}
      title={isEditing ? t('editBudget') : t('createBudget')}
      width="min(1120px, calc(100vw - 48px))"
      style={{ top: 12 }}
      wrapClassName="budget-info-modal large-form-modal"
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BudgetFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-budget"
        requiredMark={false}
      >
        <div className="budget-info-form-grid">
          <Form.Item
            label={t('workspace')}
            name="workspaceId"
            extra={isEditing ? t('workspaceBudgetMoveLocked') : undefined}
            rules={[{ required: true, message: t('selectWorkspaceFirst') }]}
          >
            <Select
              disabled={isEditing}
              optionFilterProp="label"
              options={workspaceOptions}
              placeholder={t('selectWorkspace')}
              showSearch
            />
          </Form.Item>
          <Form.Item
            className="budget-info-title-field"
            label={t('title')}
          >
            <div className="budget-info-title-control">
              <Form.Item
                noStyle
                name="title"
                rules={[
                  { required: true, message: t('budgetTitleRequired') },
                  { max: 255, message: t('budgetTitleMax') },
                ]}
              >
                <Input.TextArea
                  autoComplete="off"
                  autoSize={{ maxRows: 3, minRows: 1 }}
                />
              </Form.Item>
              <Button htmlType="button" size="small" type="link" onClick={handleResetTitle}>
                {t('reset')}
              </Button>
            </div>
          </Form.Item>
          <Form.Item
            label={t('name')}
            name="ownerName"
            rules={[{ max: 160, message: t('displayNameMax') }]}
          >
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item
            label={t('period')}
            name="dateRange"
          >
            <RangePicker allowClear className="form-full-width" />
          </Form.Item>
          <Form.Item
            label={t('baseCurrency')}
            name="baseCurrency"
            rules={[{ required: true, message: t('selectBaseCurrency') }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label={t('displayCurrency')}
            name="displayCurrency"
            rules={[{ required: true, message: t('selectDisplayCurrency') }]}
          >
            <Select options={currencyOptions} />
          </Form.Item>
          <Form.Item
            label={t('visibility')}
            name="visibility"
            rules={[{ required: true, message: t('selectVisibility') }]}
          >
            <Select options={visibilityOptions} />
          </Form.Item>
          <Form.Item
            label={t('participantMode')}
            name="participantMode"
            rules={[{ required: true, message: t('selectParticipantMode') }]}
          >
            <Radio.Group
              optionType="button"
              options={[
                { label: t('soloBudget'), value: 'solo' },
                { label: t('groupBudget'), value: 'group' },
              ]}
            />
          </Form.Item>
          <Form.Item
            className="budget-info-wide-field"
            name="pricingEnabled"
            valuePropName="checked"
            extra={t('pricingEnabledHelp')}
          >
            <Checkbox>{t('pricingEnabled')}</Checkbox>
          </Form.Item>
          {participantMode === 'group' ? (
            <div className="budget-info-wide-field group-participants-editor">
              <div className="group-participants-header">
                <div>
                  <strong>{t('participants')}</strong>
                  <span>{t('participantsHelp')}</span>
                </div>
              </div>
              <Form.List
                name="participants"
                rules={[
                  {
                    validator: async (_, participants) => {
                      if (!Array.isArray(participants) || participants.length === 0) {
                        throw new Error(t('participantsRequired'));
                      }
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    <div className="group-participant-list">
                      {fields.map((field, index) => (
                        <div className="group-participant-row" key={field.key}>
                          <Form.Item name={[field.name, 'id']} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={[field.name, 'memberUserId']} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={index === 0 ? t('participantName') : undefined}
                            name={[field.name, 'name']}
                            rules={[
                              { required: true, whitespace: true, message: t('participantNameRequired') },
                              { max: 160, message: t('participantNameMax') },
                            ]}
                          >
                            <Input maxLength={160} />
                          </Form.Item>
                          <Form.Item
                            label={index === 0 ? t('participantEmail') : undefined}
                            name={[field.name, 'email']}
                            rules={[
                              { type: 'email', message: t('emailFormatInvalid') },
                              { max: 255, message: t('emailMax') },
                            ]}
                          >
                            <Input maxLength={255} />
                          </Form.Item>
                          <Button
                            aria-label={t('delete')}
                            danger
                            disabled={fields.length <= 1}
                            icon={<Trash2 size={15} />}
                            type="text"
                            onClick={() => remove(field.name)}
                          />
                        </div>
                      ))}
                    </div>
                    <Space className="group-participant-actions">
                      <Button icon={<Plus size={15} />} type="dashed" onClick={() => add({ name: '' })}>
                        {t('addParticipant')}
                      </Button>
                    </Space>
                    <Form.ErrorList errors={errors} />
                  </>
                )}
              </Form.List>
            </div>
          ) : null}
          <Form.Item
            className="budget-info-wide-field"
            label={t('note')}
            name="note"
            rules={[{ max: 20000, message: t('noteMax') }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
