import { useMemo } from 'react';
import { Alert, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { CalendarRange, Download, FileText, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import type {
  BudgetDetail,
  BudgetItem,
  BudgetTemplateDefinition,
  CurrencyCode,
  Transaction,
} from '../../types/budget';
import {
  createBudgetItemColumns,
  createTransactionColumns,
  formatBudgetMoney,
} from '../../utils/budgetTemplate';
import { budgetStatusLabels } from '../../config/appConfig';
import { formatBudgetPeriod } from '../../utils/budgetPeriod';

interface BudgetDocumentPreviewProps {
  selectedBudget: BudgetDetail | null;
  template: BudgetTemplateDefinition | null;
  templateError: string | null;
  budgetError: string | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  entry: BudgetEntryController;
  isBudgetLoading: boolean;
  isBudgetDetailLoading: boolean;
  isTemplateLoading: boolean;
  onEditBudget?: () => void;
  onOpenShare?: () => void;
  operations: OperationsController;
}

export function BudgetDocumentPreview({
  selectedBudget,
  template,
  templateError,
  budgetError,
  baseCurrency,
  canWriteBudgets,
  entry,
  isBudgetLoading,
  isBudgetDetailLoading,
  isTemplateLoading,
  onEditBudget,
  onOpenShare,
  operations,
}: BudgetDocumentPreviewProps) {
  const budgetHighlights = template?.sections.find(
    (section) => section.key === 'budget_highlights',
  );
  const transactionBreakdown = template?.sections.find(
    (section) => section.key === 'transaction_breakdown',
  );
  const budgetColumns = useMemo(
    () => {
      const columns = createBudgetItemColumns(
        budgetHighlights?.columns ?? [],
        selectedBudget?.baseCurrency ?? baseCurrency,
      );

      return appendBudgetItemActions(columns, canWriteBudgets, entry);
    },
    [baseCurrency, budgetHighlights, canWriteBudgets, entry, selectedBudget?.baseCurrency],
  );
  const transactionColumns = useMemo(
    () =>
      appendTransactionActions(
        createTransactionColumns(transactionBreakdown?.columns ?? []),
        canWriteBudgets,
        entry,
      ),
    [canWriteBudgets, entry, transactionBreakdown],
  );
  const budgetTitle = selectedBudget?.title ?? '未选择预算';
  const budgetSubtitle = selectedBudget?.ownerName.trim() ?? '';
  const budgetDateText = selectedBudget ? formatBudgetPeriod(selectedBudget) : null;

  return (
    <main className="document-workbench">
      <div className="toolbar-row">
        <Space wrap>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<CalendarRange size={16} />}
            onClick={onEditBudget}
          >
            项目信息
          </Button>
          <Button
            disabled={selectedBudget === null || onOpenShare === undefined}
            icon={<Share2 size={16} />}
            onClick={onOpenShare}
          >
            共享
          </Button>
          <Segmented
            disabled
            value={selectedBudget?.visibility ?? 'private'}
            options={[
              { label: '私有', value: 'private' },
              { label: '工作区', value: 'workspace' },
              { label: '自定义', value: 'custom' },
            ]}
          />
        </Space>
        <Space wrap>
          {selectedBudget ? (
            <Tag color={selectedBudget.status === 'active' ? 'blue' : 'default'}>
              {budgetStatusLabels[selectedBudget.status]}
            </Tag>
          ) : null}
        </Space>
      </div>

      <div className="budget-export-strip">
        <div className="budget-export-actions">
          <span className="budget-export-label">
            <FileText size={15} />
            导出
          </span>
          <Button
            disabled={selectedBudget === null}
            icon={<Download size={13} />}
            loading={operations.creatingExportFormat === 'pdf'}
            size="small"
            onClick={() => operations.createExport('pdf')}
          >
            PDF
          </Button>
        </div>
      </div>

      {operations.operationsError ? (
        <div className="state-panel state-panel-compact">
          <Alert type="error" showIcon message={operations.operationsError} />
        </div>
      ) : null}

      {entry.entryError ? (
        <div className="state-panel state-panel-compact">
          <Alert type="error" showIcon message={entry.entryError} />
        </div>
      ) : null}

      {templateError || budgetError ? (
        <div className="state-panel">
          <Alert
            type="error"
            showIcon
            message={templateError ? '模板接口不可用' : '预算接口不可用'}
            description={templateError ?? budgetError}
          />
        </div>
      ) : isBudgetLoading ? (
        <div className="state-panel">
          <Empty description="正在加载预算..." />
        </div>
      ) : selectedBudget === null ? (
        <div className="state-panel">
          <Empty description="未选择预算" />
        </div>
      ) : (
        <section className="budget-document-preview">
          <h1>{budgetTitle}</h1>
          {budgetSubtitle ? <p>({budgetSubtitle})</p> : null}

          <div className="budget-table-frame">
            <div className="budget-section-title budget-section-title-row">
              <span>{budgetHighlights?.title}</span>
              {canWriteBudgets ? (
                <Button
                  icon={<Plus size={14} />}
                  size="small"
                  type="text"
                  onClick={entry.openBudgetItemCreateModal}
                >
                  添加
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">日期：{budgetDateText}</div>
            ) : null}
            <Table<BudgetItem>
              bordered
              columns={budgetColumns}
              dataSource={selectedBudget.items}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description="暂无预算项" /> }}
              pagination={false}
              rowKey="id"
              size="small"
              summary={() => renderBudgetSummary(budgetColumns, selectedBudget)}
              tableLayout="fixed"
            />
          </div>

          <div className="budget-table-frame">
            <div className="budget-section-title budget-section-title-row">
              <span>{transactionBreakdown?.title}</span>
              {canWriteBudgets ? (
                <Button
                  icon={<Plus size={14} />}
                  size="small"
                  type="text"
                  onClick={entry.openTransactionCreateModal}
                >
                  添加
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">日期：{budgetDateText}</div>
            ) : null}
            <Table<Transaction>
              bordered
              columns={transactionColumns}
              dataSource={selectedBudget.transactions}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description="暂无交易" /> }}
              pagination={false}
              rowKey="id"
              size="small"
              tableLayout="fixed"
            />
          </div>
        </section>
      )}
    </main>
  );
}

function renderBudgetSummary(
  columns: TableProps<BudgetItem>['columns'],
  selectedBudget: BudgetDetail,
) {
  if (columns === undefined || columns.length === 0) {
    return null;
  }

  return (
    <Table.Summary>
      <Table.Summary.Row className="budget-summary-row">
        {columns.map((column, index) => {
          const key = String(column.key ?? '');
          const isNumberColumn =
            key === 'budget' || key === 'estimated_actuals' || key === 'variance';

          return (
            <Table.Summary.Cell
              className={isNumberColumn ? 'budget-summary-number' : undefined}
              index={index}
              key={`${key}-${index}`}
            >
              {summaryCellContent(key, index, selectedBudget)}
            </Table.Summary.Cell>
          );
        })}
      </Table.Summary.Row>
    </Table.Summary>
  );
}

function summaryCellContent(key: string, index: number, selectedBudget: BudgetDetail): string {
  if (key === 'budget') {
    return formatBudgetMoney(selectedBudget.baseCurrency, selectedBudget.totals.totalBudgetBase);
  }

  if (key === 'estimated_actuals') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      selectedBudget.totals.totalEstimatedBase,
    );
  }

  if (key === 'variance') {
    return formatBudgetMoney(selectedBudget.baseCurrency, selectedBudget.totals.totalVarianceBase);
  }

  if (key === 'actions') {
    return '';
  }

  return index === 0 ? '统计' : '';
}

function appendBudgetItemActions(
  columns: TableProps<BudgetItem>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
): TableProps<BudgetItem>['columns'] {
  if (!canWriteBudgets) {
    return columns;
  }

  return [
    ...(columns ?? []),
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 72,
      render: (_: unknown, row: BudgetItem) => (
        <Space size={2}>
          <Tooltip title="编辑">
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openBudgetItemEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这个预算项？"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleBudgetItemDelete(row.id)}
          >
            <Tooltip title="删除">
              <Button
                danger
                icon={<Trash2 size={14} />}
                loading={entry.deletingBudgetItemId === row.id}
                size="small"
                type="text"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

function appendTransactionActions(
  columns: TableProps<Transaction>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
): TableProps<Transaction>['columns'] {
  if (!canWriteBudgets) {
    return columns;
  }

  return [
    ...(columns ?? []),
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 72,
      render: (_: unknown, row: Transaction) => (
        <Space size={2}>
          <Tooltip title="编辑">
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openTransactionEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这条交易？"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleTransactionDelete(row.id)}
          >
            <Tooltip title="删除">
              <Button
                danger
                icon={<Trash2 size={14} />}
                loading={entry.deletingTransactionId === row.id}
                size="small"
                type="text"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
