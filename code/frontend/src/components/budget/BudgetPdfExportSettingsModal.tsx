import { useEffect } from 'react';
import { Checkbox, Form, Modal, Radio, Switch } from 'antd';
import { normalizePdfTheme, pdfThemeOptions } from '../../config/pdfThemes';
import { languageOptions, useI18n } from '../../i18n';
import type { AppLanguage } from '../../i18n';
import type { PdfExportSettings } from '../../types/auth';
import type { PdfThemeKey } from '../../types/budget';
import { normalizePdfExportSettings, normalizePdfLanguages, normalizeSignatureLabelMode } from '../../utils/pdfExportSettings';

export interface BudgetPdfExportSettingsValue extends PdfExportSettings {
  pdfTheme: PdfThemeKey;
}

interface BudgetPdfExportSettingsModalProps {
  open: boolean;
  value: BudgetPdfExportSettingsValue;
  onApply: (value: BudgetPdfExportSettingsValue) => void;
  onCancel: () => void;
}

export function budgetPdfExportSettingsValue(
  pdfTheme: PdfThemeKey | string | null | undefined,
  settings: Partial<PdfExportSettings> | null | undefined,
): BudgetPdfExportSettingsValue {
  const normalizedSettings = normalizePdfExportSettings(settings);

  return {
    ...normalizedSettings,
    pdfTheme: normalizePdfTheme(pdfTheme),
  };
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

    onApply({
      pdfTheme: normalizePdfTheme(values.pdfTheme),
      showWorkspace: values.showWorkspace === true,
      pdfLanguages: normalizePdfLanguages(values.pdfLanguages),
      signatureLabelMode: normalizeSignatureLabelMode(values.signatureLabelMode),
      signatureLabelLanguages: normalizePdfLanguages(values.signatureLabelLanguages),
    });
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
