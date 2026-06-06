import { Button, Space } from 'antd';
import { Download, FileText } from 'lucide-react';
import type { OperationsController } from '../../hooks/useOperationsController';
import type { BudgetDetail, BudgetExportFormat } from '../../types/budget';

const exportFormats: Array<{ label: string; value: BudgetExportFormat }> = [
  { label: 'Markdown', value: 'markdown' },
  { label: 'DOCX', value: 'docx' },
  { label: 'PDF', value: 'pdf' },
];

interface ExportSideSectionProps {
  operations: OperationsController;
  selectedBudget: BudgetDetail | null;
}

export function ExportSideSection({ operations, selectedBudget }: ExportSideSectionProps) {
  return (
    <div className="side-section">
      <div className="side-title">
        <FileText size={16} />
        <span>Exports</span>
      </div>
      <Space wrap>
        {exportFormats.map((format) => (
          <Button
            disabled={selectedBudget === null}
            icon={<Download size={13} />}
            key={format.value}
            loading={operations.creatingExportFormat === format.value}
            size="small"
            onClick={() => operations.createExport(format.value)}
          >
            {format.label}
          </Button>
        ))}
      </Space>
      <div className="operation-list operation-list-spaced">
        {selectedBudget === null ? (
          <div className="empty-line">Select a budget to export.</div>
        ) : operations.isExportLoading ? (
          <div className="empty-line">Loading export history...</div>
        ) : operations.exports.length === 0 ? (
          <div className="empty-line">No export history.</div>
        ) : (
          operations.exports.slice(0, 5).map((item) => (
            <div className="operation-list-item operation-list-item-row" key={item.id}>
              <div className="operation-list-main">
                <span>{item.fileName}</span>
                <small>{item.createdAt}</small>
              </div>
              <Button
                icon={<Download size={13} />}
                size="small"
                onClick={() => operations.downloadExport(item)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
