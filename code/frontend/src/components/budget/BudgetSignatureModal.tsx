import { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import type { DraggableBounds, DraggableData, DraggableEvent } from 'react-draggable';
import { Alert, AutoComplete, Button, Checkbox, Collapse, DatePicker, Form, Input, Modal, Select, Space, Tooltip } from 'antd';
import type { CollapseProps, FormInstance } from 'antd';
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';
import { ModalFullscreenButton } from '../common/ModalFullscreenButton';
import {
  type AppLanguage,
  languageOptions,
  useI18n,
} from '../../i18n';
import type { WorkspaceMember } from '../../types/auth';
import type { BudgetFormValues } from '../../types/forms';
import {
  createSignatureCustomField,
  createSignatureRow,
  memberOptions,
  signatureCustomFieldLabelOptions,
  signatureMetaLabelsForLanguage,
  signatureLabelForConfig,
  signaturePositionPhraseOptions,
  signatureRolePhraseOptions,
  signatureRowFromMember,
} from '../../utils/budgetSignature';

interface BudgetSignatureModalProps {
  form: FormInstance<BudgetFormValues>;
  open: boolean;
  error: string | null;
  workspaceMembers: WorkspaceMember[];
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function BudgetSignatureModal({
  form,
  open,
  error,
  workspaceMembers,
  confirmLoading,
  onCancel,
  onOk,
}: BudgetSignatureModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bounds, setBounds] = useState<DraggableBounds>({
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  });
  const draggleRef = useRef<HTMLDivElement>(null);
  const { language, t } = useI18n();
  const signatureEnabled = Form.useWatch(['signatureConfig', 'enabled'], form) === true;
  const signatureInfoLanguage = normalizeSignatureLanguage(
    Form.useWatch(['signatureConfig', 'infoLanguage'], form),
  );
  const signatureLabelLanguage = Form.useWatch(['signatureConfig', 'labelLanguage'], form) ?? 'en';
  const signatureLabelMode = Form.useWatch(['signatureConfig', 'labelMode'], form) ?? 'confirmation_signature';
  const signatureLabelSeparator = Form.useWatch(['signatureConfig', 'labelSeparator'], form) ?? 'space';
  const onlineMemberOptions = memberOptions(workspaceMembers);
  const signatureUiLabels = signatureMetaLabelsForLanguage(language);
  const rolePhraseOptions = signatureRolePhraseOptions(language);
  const positionPhraseOptions = signaturePositionPhraseOptions(language);
  const customFieldLabelOptions = signatureCustomFieldLabelOptions(language);
  const signatureLabelPreview = signatureLabelForConfig({
    enabled: true,
    title: '',
    infoLanguage: signatureInfoLanguage,
    labelLanguage: signatureLabelLanguage,
    labelMode: signatureLabelMode,
    labelSeparator: signatureLabelSeparator,
    sectionAlign: 'full',
    labelAlign: 'left',
    showControlText: true,
    rows: [],
  });
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
  const handleDragStart = (_event: DraggableEvent, data: DraggableData) => {
    const { clientWidth, clientHeight } = window.document.documentElement;
    const targetRect = draggleRef.current?.getBoundingClientRect();

    if (targetRect === undefined) {
      return;
    }

    setBounds({
      bottom: clientHeight - (targetRect.bottom - data.y),
      left: -targetRect.left + data.x,
      right: clientWidth - (targetRect.right - data.x),
      top: -targetRect.top + data.y,
    });
  };
  const titleTools = (
    <div className="budget-signature-title-tools">
      <Tooltip title={collapsed ? t('expand') : t('collapse')}>
        <Button
          icon={collapsed ? <ChevronDown size={14} /> : <Minus size={14} />}
          size="small"
          type="text"
          onClick={() => setCollapsed((current) => !current)}
        />
      </Tooltip>
      <ModalFullscreenButton fullscreen={fullscreen} setFullscreen={setFullscreen} />
    </div>
  );

  return (
    <Modal
      destroyOnClose
      forceRender
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setCollapsed(false);
        }
      }}
      confirmLoading={confirmLoading}
      footer={collapsed ? null : undefined}
      okText={t('save')}
      open={open}
      title={
        <div className="modal-title-with-tools budget-signature-drag-handle">
          <span>{t('signatureSettings')}</span>
          {titleTools}
        </div>
      }
      width={collapsed ? 420 : fullscreen ? 'calc(100vw - 24px)' : 'min(1280px, calc(100vw - 36px))'}
      style={{ top: 10 }}
      wrapClassName={`budget-signature-modal large-form-modal${fullscreen ? ' modal-fullscreen' : ''}${collapsed ? ' modal-collapsed' : ''}`}
      modalRender={(modal) => {
        if (fullscreen) {
          return modal;
        }

        return (
          <Draggable
            bounds={bounds}
            cancel=".budget-signature-title-tools, .ant-modal-close"
            handle=".budget-signature-drag-handle"
            nodeRef={draggleRef}
            onStart={handleDragStart}
          >
            <div ref={draggleRef}>{modal}</div>
          </Draggable>
        );
      }}
      onCancel={onCancel}
      onOk={onOk}
    >
      {collapsed ? null : (
        <>
          {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
          <Form<BudgetFormValues>
            form={form}
            layout="vertical"
            name="budget-centre-budget-signature"
            requiredMark={false}
          >
            <div className="signature-config-panel signature-config-panel-top">
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
                  <div className="modal-form-grid modal-form-grid-three">
                    <Form.Item
                      label={t('signatureInfoLanguage')}
                      name={['signatureConfig', 'infoLanguage']}
                    >
                      <Select options={languageOptions} />
                    </Form.Item>
                    <Form.Item
                      label={t('signatureLabelLanguage')}
                      name={['signatureConfig', 'labelLanguage']}
                    >
                      <Select options={languageOptions} />
                    </Form.Item>
                    <Form.Item label={t('signatureLabelMode')} name={['signatureConfig', 'labelMode']}>
                      <Select
                        options={[
                          { label: t('confirmationSignature'), value: 'confirmation_signature' },
                          { label: t('confirmationOnly'), value: 'confirmation' },
                          { label: t('signatureOnly'), value: 'signature' },
                        ]}
                      />
                    </Form.Item>
                  </div>
                  <div className="modal-form-grid modal-form-grid-three">
                    <Form.Item
                      label={t('signatureLabelSeparator')}
                      name={['signatureConfig', 'labelSeparator']}
                    >
                      <Select
                        options={[
                          { label: t('noneSeparator'), value: 'none' },
                          { label: t('spaceSeparator'), value: 'space' },
                          { label: t('slashSeparator'), value: 'slash' },
                          { label: t('lineSeparator'), value: 'line' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label={t('signatureSectionAlign')} name={['signatureConfig', 'sectionAlign']}>
                      <Select
                        options={[
                          { label: t('alignFullWidth'), value: 'full' },
                          { label: t('alignRightWhenNotFull'), value: 'right' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label={t('signatureLabelAlign')} name={['signatureConfig', 'labelAlign']}>
                      <Select
                        options={[
                          { label: t('alignLeft'), value: 'left' },
                          { label: t('alignRight'), value: 'right' },
                        ]}
                      />
                    </Form.Item>
                  </div>
                  <div className="signature-label-preview">
                    <span>{t('preview')}</span>
                    <strong>{signatureLabelPreview}</strong>
                  </div>
                  <Form.List name={['signatureConfig', 'rows']}>
                    {(fields, { add, remove }) => (
                      <div className="signature-row-list">
                        {fields.map((field) => {
                          const participantItems: CollapseProps['items'] = [
                            {
                              key: 'participant',
                              label: (
                                <strong>
                                  {t('signatureParticipant')} {field.name + 1}
                                </strong>
                              ),
                              extra: (
                                <Button
                                  danger
                                  icon={<Trash2 size={14} />}
                                  size="small"
                                  type="text"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    remove(field.name);
                                  }}
                                >
                                  {t('remove')}
                                </Button>
                              ),
                              children: (
                                <div className="signature-config-row-body">
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
                                      <AutoComplete
                                        allowClear
                                        options={rolePhraseOptions}
                                        placeholder={rolePhraseOptions[0]?.value ?? t('preparedBy')}
                                      />
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
                                      <AutoComplete
                                        allowClear
                                        options={positionPhraseOptions}
                                        placeholder={positionPhraseOptions[0]?.value ?? t('financeOwner')}
                                      />
                                    </Form.Item>
                                  </div>
                                  <Form.List name={[field.name, 'customFields']}>
                                    {(customFields, { add: addCustomField, remove: removeCustomField }) => (
                                      <div className="signature-custom-field-list">
                                        <div className="signature-custom-field-head">
                                          <strong>{t('customSignatureFields')}</strong>
                                          <Button
                                            icon={<Plus size={14} />}
                                            size="small"
                                            type="dashed"
                                            onClick={() => addCustomField(createSignatureCustomField())}
                                          >
                                            {t('addSignatureCustomField')}
                                          </Button>
                                        </div>
                                        {customFields.map((customField) => (
                                          <div className="signature-custom-field-row" key={customField.key}>
                                            <Form.Item
                                              className="signature-custom-field-input"
                                              label={t('customFieldLabel')}
                                              name={[customField.name, 'label']}
                                              rules={[{ max: 80, message: t('signatureConfigTextMax') }]}
                                            >
                                              <AutoComplete
                                                allowClear
                                                options={customFieldLabelOptions}
                                                placeholder={signatureUiLabels.telephone}
                                              />
                                            </Form.Item>
                                            <Form.Item
                                              className="signature-custom-field-input"
                                              label={t('customFieldValue')}
                                              name={[customField.name, 'value']}
                                              rules={[{ max: 240, message: t('signatureConfigTextMax') }]}
                                            >
                                              <Input autoComplete="off" placeholder={t('remark')} />
                                            </Form.Item>
                                            <Form.Item name={[customField.name, 'show']} valuePropName="checked">
                                              <Checkbox>{t('showCustomField')}</Checkbox>
                                            </Form.Item>
                                            <Button
                                              danger
                                              icon={<Trash2 size={14} />}
                                              size="small"
                                              type="text"
                                              onClick={() => removeCustomField(customField.name)}
                                            >
                                              {t('remove')}
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </Form.List>
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
                              ),
                            },
                          ];

                          return (
                            <Collapse
                              className="signature-config-row-collapse"
                              defaultActiveKey={['participant']}
                              expandIcon={({ isActive }) => (
                                isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                              )}
                              ghost
                              items={participantItems}
                              key={field.key}
                            />
                          );
                        })}
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
        </>
      )}
    </Modal>
  );
}

function normalizeSignatureLanguage(value: unknown): AppLanguage {
  return value === 'sc' || value === 'tc' || value === 'en' ? value : 'en';
}
