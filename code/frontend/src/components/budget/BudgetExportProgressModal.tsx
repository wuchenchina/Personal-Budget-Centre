import { Button, Modal, Progress, Result, Space, Tag, Typography } from 'antd';
import { Download, FileText, X } from 'lucide-react';
import { exportDownloadUrl } from '../../api/exports';
import { useI18n } from '../../i18n';
import type { BudgetExport } from '../../types/budget';

const { Text } = Typography;

interface BudgetExportProgressModalProps {
  exportJob: BudgetExport | null;
  onClose: () => void;
}

export function BudgetExportProgressModal({ exportJob, onClose }: BudgetExportProgressModalProps) {
  const { t } = useI18n();
  const open = exportJob !== null;
  const percent = Math.max(0, Math.min(100, Math.round(exportJob?.progressPercent ?? 0)));
  const completed = exportJob?.status === 'completed';
  const failed = exportJob?.status === 'failed';
  const active = exportJob?.status === 'queued' || exportJob?.status === 'processing';

  return (
    <Modal
      centered
      destroyOnClose
      footer={null}
      maskClosable={completed || failed}
      open={open}
      title={(
        <span className="pdf-export-modal-title">
          <FileText size={16} />
          {t('pdfExportProgressTitle')}
        </span>
      )}
      width={460}
      onCancel={completed || failed ? onClose : undefined}
    >
      {exportJob ? (
        <div className="pdf-export-modal">
          {failed ? (
            <Result
              status="error"
              title={t('pdfExportFailed')}
              subTitle={exportJob.errorMessage ?? t('pdfExportFailedDescription')}
              extra={<Button icon={<X size={15} />} onClick={onClose}>{t('close')}</Button>}
            />
          ) : (
            <>
              <div className="pdf-export-modal-meta">
                <Tag color="red">{exportJob.scope}</Tag>
                <Tag color={completed ? 'green' : 'processing'}>{t(exportStatusKey(exportJob.status))}</Tag>
              </div>
              <Progress
                percent={completed ? 100 : percent}
                status={completed ? 'success' : active ? 'active' : 'normal'}
                strokeColor="#db0011"
              />
              <div className="pdf-export-modal-grid">
                <Text type="secondary">{t('pdfExportStage')}</Text>
                <Text>{stageLabel(exportJob.progressStage)}</Text>
                <Text type="secondary">{t('pdfExportRows')}</Text>
                <Text>{rowsText(exportJob)}</Text>
                <Text type="secondary">{t('pdfExportPages')}</Text>
                <Text>{exportJob.pages ?? '-'}</Text>
              </div>
              <Space className="pdf-export-modal-actions">
                {completed ? (
                  <Button
                    type="primary"
                    icon={<Download size={15} />}
                    href={exportDownloadUrl(exportJob)}
                    onClick={onClose}
                  >
                    {t('download')}
                  </Button>
                ) : null}
                {completed ? <Button onClick={onClose}>{t('close')}</Button> : null}
              </Space>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function rowsText(exportJob: BudgetExport): string {
  const processed = exportJob.rowsProcessed ?? 0;
  if (exportJob.rowsTotal === null) {
    return processed.toLocaleString('en-US');
  }
  return `${processed.toLocaleString('en-US')} / ${exportJob.rowsTotal.toLocaleString('en-US')}`;
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ');
}

function exportStatusKey(status: BudgetExport['status']) {
  switch (status) {
    case 'completed':
      return 'pdfExportCompleted';
    case 'failed':
      return 'pdfExportFailed';
    case 'processing':
      return 'pdfExportProcessing';
    default:
      return 'pdfExportQueued';
  }
}
