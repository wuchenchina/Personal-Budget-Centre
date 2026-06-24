import { useEffect } from 'react';
import { Checkbox, Form, Modal, Radio, Switch } from 'antd';
import { normalizePdfTheme, pdfThemeOptions } from '../../config/pdfThemes';
import { languageOptions, useI18n } from '../../i18n';
import type { AppLanguage } from '../../i18n';
import type { BudgetSignatureLabelMode, PdfThemeKey } from '../../types/budget';
import type { BudgetPdfExportSettingsValue } from '../../utils/budgetPdfExportSettingsValue';
import {
  alignPdfChineseLanguages,
  normalizePdfLanguages,
  normalizePdfLanguagesForChange,
  normalizeSignatureLabelMode,
} from '../../utils/pdfExportSettings';

interface BudgetPdfExportSettingsModalProps {
  open: boolean;
  value: BudgetPdfExportSettingsValue;
  onApply: (value: BudgetPdfExportSettingsValue) => void;
  onCancel: () => void;
}

export function BudgetPdfExportSettingsModal({
  open,
  value,
  onApply,
  onCancel,
}: BudgetPdfExportSettingsModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<BudgetPdfExportSettingsValue>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue(value);
    }
  }, [form, open, value]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const alignedLanguages = alignPdfChineseLanguages(
      normalizePdfLanguages(values.pdfLanguages),
      normalizePdfLanguages(values.signatureLabelLanguages),
    );

    onApply({
      pdfTheme: normalizePdfTheme(values.pdfTheme),
      showWorkspace: values.showWorkspace === true,
      pdfLanguages: alignedLanguages.pdfLanguages,
      signatureLabelMode: normalizeSignatureLabelMode(values.signatureLabelMode),
      signatureLabelLanguages: alignedLanguages.signatureLabelLanguages,
    });
  };

  const syncChineseLanguages = (
    changedValues: Partial<Pick<BudgetPdfExportSettingsValue, 'pdfLanguages' | 'signatureLabelLanguages'>>,
    values: BudgetPdfExportSettingsValue,
  ) => {
    const changedLanguages = changedValues.pdfLanguages ?? changedValues.signatureLabelLanguages;
    if (!changedLanguages) {
      return;
    }

    const alignedLanguages = alignPdfChineseLanguages(
      normalizePdfLanguages(values.pdfLanguages),
      normalizePdfLanguages(values.signatureLabelLanguages),
      changedLanguages.find((language) => language === 'sc' || language === 'tc') ?? null,
    );

    form.setFieldsValue(alignedLanguages);
  };

  return (
    <Modal
      destroyOnClose
      forceRender
      okText={t('pdfExportApplySettings')}
      open={open}
      title={t('pdfExportSettings')}
      width={560}
      onCancel={onCancel}
      onOk={handleOk}
    >
      <Form
        form={form}
        initialValues={value}
        layout="vertical"
        preserve={false}
        onValuesChange={syncChineseLanguages}
      >
        <Form.Item
          label={t('pdfTheme')}
          name="pdfTheme"
          rules={[{ required: true, message: t('pdfThemeRequired') }]}
        >
          <Radio.Group
            options={pdfThemeOptions.map((theme) => ({
              label: t(pdfThemeLabelKey(theme.key)),
              value: theme.key,
            }))}
          />
        </Form.Item>
        <Form.Item
          extra={t('pdfExportLanguagesDescription')}
          label={t('pdfExportLanguages')}
          name="pdfLanguages"
          normalize={normalizePdfLanguagesForChange}
          rules={[
            {
              validator: async (_, selected: AppLanguage[] | undefined) => {
                if (Array.isArray(selected) && selected.length > 0) {
                  return;
                }

                throw new Error(t('pdfExportLanguageRequired'));
              },
            },
          ]}
        >
          <Checkbox.Group options={languageOptions} />
        </Form.Item>
        <Form.Item
          extra={t('pdfExportShowWorkspaceDescription')}
          label={t('pdfExportShowWorkspace')}
          name="showWorkspace"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          extra={t('pdfExportSignatureLabelModeDescription')}
          label={t('pdfExportSignatureLabelMode')}
          name="signatureLabelMode"
          rules={[{ required: true, message: t('pdfExportSignatureLabelModeRequired') }]}
        >
          <Radio.Group options={signatureLabelModeOptions(t)} />
        </Form.Item>
        <Form.Item
          extra={t('pdfExportSignatureLabelLanguagesDescription')}
          label={t('pdfExportSignatureLabelLanguages')}
          name="signatureLabelLanguages"
          normalize={normalizePdfLanguagesForChange}
          rules={[
            {
              validator: async (_, selected: AppLanguage[] | undefined) => {
                if (Array.isArray(selected) && selected.length > 0) {
                  return;
                }

                throw new Error(t('pdfExportSignatureLabelLanguageRequired'));
              },
            },
          ]}
        >
          <Checkbox.Group options={languageOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function pdfThemeLabelKey(theme: PdfThemeKey) {
  switch (theme) {
    case 'hsbc':
      return 'pdfThemeHsbc';
    case 'uswds':
      return 'pdfThemeUswds';
    default:
      return 'pdfThemeClassic';
  }
}

function signatureLabelModeOptions(t: (key: 'confirmationSignature' | 'confirmationOnly' | 'signatureOnly') => string) {
  return [
    { label: t('confirmationSignature'), value: 'confirmation_signature' },
    { label: t('confirmationOnly'), value: 'confirmation' },
    { label: t('signatureOnly'), value: 'signature' },
  ] satisfies Array<{ label: string; value: BudgetSignatureLabelMode }>;
}
