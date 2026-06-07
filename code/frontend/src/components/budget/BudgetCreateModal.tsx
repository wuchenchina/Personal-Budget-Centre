import { Alert, Button, Checkbox, DatePicker, Form, Input, Modal, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import {
  budgetStatusLabelsByLanguage,
  useI18n,
  visibilityLabelsByLanguage,
} from '../../i18n';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetStatus, Visibility } from '../../types/budget';
import type { BudgetFormValues } from '../../types/forms';
import {
  createSignatureRow,
  memberOptions,
  signatureRowFromMember,
} from '../../utils/budgetSignature';
import { defaultBudgetTitle } from '../../utils/budgetTitle';

const { RangePicker } = DatePicker;

interface BudgetCreateModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  isEditing: boolean;
  error: string | null;
  workspaceOptions: Array<{ label: string; value: number }>;
  workspaceMembers: WorkspaceMember[];
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
  workspaceMembers,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetCreateModalProps) {
  const { language, t } = useI18n();
  const dateRange = Form.useWatch('dateRange', form);
  const ownerNameHidden = Form.useWatch('ownerNameHidden', form) === true;
  const signatureEnabled = Form.useWatch(['signatureConfig', 'enabled'], form) === true;
  const onlineMemberOptions = memberOptions(workspaceMembers);
  const visibilityOptions: Array<{ label: string; value: Visibility }> = [
    { label: visibilityLabelsByLanguage[language].private, value: 'private' },
    { label: visibilityLabelsByLanguage[language].workspace, value: 'workspace' },
    { label: visibilityLabelsByLanguage[language].custom, value: 'custom' },
  ];
  const statusOptions: Array<{ label: string; value: BudgetStatus }> = [
    { label: budgetStatusLabelsByLanguage[language].draft, value: 'draft' },
    { label: budgetStatusLabelsByLanguage[language].active, value: 'active' },
    { label: budgetStatusLabelsByLanguage[language].closed, value: 'closed' },
    { label: budgetStatusLabelsByLanguage[language].archived, value: 'archived' },
  ];
  const handleResetTitle = () => {
    form.setFieldValue('title', defaultBudgetTitle(dateRange ?? null));
  };
  const syncSignatureMember = (fieldName: number, memberUserId: number | null | undefined) => {
    const member = workspaceMembers.find((item) => item.userId === memberUserId);
    if (member === undefined) {
      return;
    }

    const currentRows = form.getFieldValue(['signatureConfig', 'rows']) ?? [];
    const current = currentRows[fieldName] ?? {};
    const memberRow = signatureRowFromMember(member, current.roleLabel ?? '');
    form.setFieldValue(['signatureConfig', 'rows', fieldName], {
      ...current,
      id: current.id ?? memberRow.id,
      participantType: memberRow.participantType,
      memberUserId: memberRow.memberUserId,
      displayName: memberRow.displayName,
      email: memberRow.email,
    });
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
      wrapClassName="budget-info-modal"
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
            name="title"
            rules={[
              { required: true, message: t('budgetTitleRequired') },
              { max: 255, message: t('budgetTitleMax') },
            ]}
          >
            <Input
              autoComplete="off"
              addonAfter={
                <Button size="small" type="link" onClick={handleResetTitle}>
                  {t('reset')}
                </Button>
              }
            />
          </Form.Item>
          <Form.Item className="budget-info-inline-check" name="ownerNameHidden" valuePropName="checked">
            <Checkbox>{t('hideDisplayName')}</Checkbox>
          </Form.Item>
          {ownerNameHidden ? null : (
            <Form.Item
              label={t('displayName')}
              name="ownerName"
              rules={[{ max: 160, message: t('displayNameMax') }]}
            >
              <Input autoComplete="name" />
            </Form.Item>
          )}
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
            label={t('status')}
            name="status"
            rules={[{ required: true, message: t('selectStatus') }]}
          >
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item
            className="budget-info-wide-field"
            label={t('note')}
            name="note"
            rules={[{ max: 20000, message: t('noteMax') }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </div>
        <div className="signature-config-panel">
          <Form.Item name={['signatureConfig', 'enabled']} valuePropName="checked">
            <Checkbox>{t('showSignatureSection')}</Checkbox>
          </Form.Item>
          {signatureEnabled ? (
            <>
              <Form.Item
                label={t('signatureSectionTitle')}
                name={['signatureConfig', 'title']}
                rules={[{ max: 120, message: t('signatureConfigTextMax') }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.List name={['signatureConfig', 'rows']}>
                {(fields, { add, remove }) => (
                  <div className="signature-row-list">
                    {fields.map((field) => (
                      <div className="signature-config-row" key={field.key}>
                        <div className="signature-config-row-head">
                          <strong>
                            {t('signatureParticipant')} {field.name + 1}
                          </strong>
                          <Button
                            danger
                            icon={<Trash2 size={14} />}
                            size="small"
                            type="text"
                            onClick={() => remove(field.name)}
                          >
                            {t('remove')}
                          </Button>
                        </div>
                        <div className="modal-form-grid">
                          <Form.Item
                            label={t('participantSource')}
                            name={[field.name, 'participantType']}
                          >
                            <Select
                              options={[
                                { label: t('workspaceMember'), value: 'workspace_member' },
                                { label: t('manualEntry'), value: 'manual' },
                              ]}
                            />
                          </Form.Item>
                          <Form.Item
                            label={t('workspaceMember')}
                            name={[field.name, 'memberUserId']}
                          >
                            <Select
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={onlineMemberOptions}
                              placeholder={t('selectWorkspaceMember')}
                              onChange={(value) => syncSignatureMember(field.name, value)}
                            />
                          </Form.Item>
                        </div>
                        <div className="modal-form-grid">
                          <Form.Item
                            label={t('roleLabel')}
                            name={[field.name, 'roleLabel']}
                            rules={[{ max: 120, message: t('signatureConfigTextMax') }]}
                          >
                            <Input autoComplete="off" placeholder={t('preparedBy')} />
                          </Form.Item>
                          <Form.Item
                            label={t('displayName')}
                            name={[field.name, 'displayName']}
                            rules={[{ max: 160, message: t('displayNameMax') }]}
                          >
                            <Input autoComplete="off" />
                          </Form.Item>
                        </div>
                        <div className="modal-form-grid">
                          <Form.Item
                            label={t('email')}
                            name={[field.name, 'email']}
                            rules={[{ max: 190, message: t('signatureConfigTextMax') }]}
                          >
                            <Input autoComplete="off" />
                          </Form.Item>
                          <Form.Item
                            label={t('position')}
                            name={[field.name, 'position']}
                            rules={[{ max: 160, message: t('signatureConfigTextMax') }]}
                          >
                            <Input autoComplete="off" />
                          </Form.Item>
                        </div>
                        <Form.Item label={t('dateTime')} name={[field.name, 'signedAt']}>
                          <DatePicker
                            allowClear
                            className="form-full-width"
                            format="YYYY-MM-DD HH:mm:ss"
                            showTime
                          />
                        </Form.Item>
                        <Space className="signature-option-grid" wrap>
                          <Form.Item name={[field.name, 'showRole']} valuePropName="checked">
                            <Checkbox>{t('showRole')}</Checkbox>
                          </Form.Item>
                          <Form.Item name={[field.name, 'showName']} valuePropName="checked">
                            <Checkbox>{t('showName')}</Checkbox>
                          </Form.Item>
                          <Form.Item name={[field.name, 'showEmail']} valuePropName="checked">
                            <Checkbox>{t('showEmail')}</Checkbox>
                          </Form.Item>
                          <Form.Item name={[field.name, 'showPosition']} valuePropName="checked">
                            <Checkbox>{t('showPosition')}</Checkbox>
                          </Form.Item>
                          <Form.Item name={[field.name, 'showSignature']} valuePropName="checked">
                            <Checkbox>{t('showSignatureBox')}</Checkbox>
                          </Form.Item>
                          <Form.Item name={[field.name, 'showDateTime']} valuePropName="checked">
                            <Checkbox>{t('showDateTime')}</Checkbox>
                          </Form.Item>
                        </Space>
                      </div>
                    ))}
                    <Button
                      block
                      icon={<Plus size={14} />}
                      type="dashed"
                      onClick={() => add(createSignatureRow('manual'))}
                    >
                      {t('addSignatureParticipant')}
                    </Button>
                  </div>
                )}
              </Form.List>
            </>
          ) : null}
        </div>
      </Form>
    </Modal>
  );
}
