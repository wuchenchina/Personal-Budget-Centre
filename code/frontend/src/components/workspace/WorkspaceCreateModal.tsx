import { Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import { useI18n, workspaceTypeLabelsByLanguage } from '../../i18n';
import type { CurrencyCode } from '../../types/budget';
import type { WorkspaceFormValues } from '../../types/forms';
import { renderCurrencyOption, type CurrencySelectOption } from '../../utils/currencyOptions';

type WorkspaceType = WorkspaceFormValues['type'];

interface WorkspaceTypeOption {
  label: string;
  value: WorkspaceType;
  description: string;
}

interface WorkspaceCreateModalProps {
  form: FormInstance<WorkspaceFormValues>;
  open: boolean;
  baseCurrency: CurrencyCode;
  currencyOptions: CurrencySelectOption[];
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

export function WorkspaceCreateModal({
  form,
  open,
  baseCurrency,
  currencyOptions,
  confirmLoading,
  onCancel,
  onOk,
}: WorkspaceCreateModalProps) {
  const { language, t } = useI18n();
  const selectedType = Form.useWatch('type', form);
  const workspaceTypeOptions: WorkspaceTypeOption[] = [
    {
      label: workspaceTypeLabelsByLanguage[language].family,
      value: 'family',
      description: t('workspaceTypeFamilyDesc'),
    },
    {
      label: workspaceTypeLabelsByLanguage[language].team,
      value: 'team',
      description: t('workspaceTypeTeamDesc'),
    },
    {
      label: workspaceTypeLabelsByLanguage[language].custom,
      value: 'custom',
      description: t('workspaceTypeCustomDesc'),
    },
  ];

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={t('create')}
      open={open}
      title={t('createWorkspace')}
      onCancel={onCancel}
      onOk={onOk}
    >
      <Form<WorkspaceFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-create-workspace"
        requiredMark={false}
        initialValues={{
          type: 'team',
          defaultCurrency: currencyOptions.some((option) => option.value === baseCurrency)
            ? baseCurrency
            : null,
        }}
      >
        <Form.Item
          label={t('name')}
          name="name"
          rules={[
            { required: true, message: t('workspaceNameRequired') },
            { max: 160, message: t('workspaceNameMax') },
          ]}
        >
          <Input
            autoComplete="organization"
            placeholder={t('workspaceNamePlaceholder')}
          />
        </Form.Item>
        <Form.Item
          extra={selectedType === 'custom' ? t('workspaceCustomTypeHelp') : undefined}
          label={t('workspaceType')}
          name="type"
          rules={[{ required: true, message: t('selectWorkspaceType') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={workspaceTypeOptions}
            placeholder={t('workspaceTypePlaceholder')}
            optionRender={(option) => {
              const data = option.data as WorkspaceTypeOption;

              return (
                <div>
                  <div>{data.label}</div>
                  <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>
                    {data.description}
                  </div>
                </div>
              );
            }}
          />
        </Form.Item>
        <Form.Item
          label={t('defaultCurrency')}
          name="defaultCurrency"
        >
          <Select
            allowClear
            notFoundContent={t('noCurrencies')}
            showSearch
            optionFilterProp="label"
            optionLabelProp="value"
            optionRender={renderCurrencyOption}
            options={currencyOptions}
            placeholder={t('defaultCurrencyPlaceholder')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
