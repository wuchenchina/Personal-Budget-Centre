import { useMemo } from 'react';
import { Alert, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
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
  renderBudgetTemplateText,
} from '../../utils/budgetTemplate';
import { budgetStatusLabels } from '../../config/appConfig';

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
  const budgetTitle =
    selectedBudget && template
      ? renderBudgetTemplateText(template.titleTemplate, selectedBudget)
      : (template?.titleTemplate ?? '未选择预算');
  const budgetSubtitle =
    selectedBudget && template
      ? renderBudgetTemplateText(template.subtitleTemplate, selectedBudget)
      : '创建或选择一个预算';
  const budgetDateText = selectedBudget
    ? `日期：${selectedBudget.startDate} 至 ${selectedBudget.endDate}`
    : '日期：-';

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
          <Tag color="blue">手动汇率</Tag>
          <Tag>BOCHK 汇率</Tag>
          <Tag>Mastercard 汇率</Tag>
        </Space>
      </div>

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
          <p>{budgetSubtitle}</p>

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
            <div className="budget-section-date">{budgetDateText}</div>
            <Table<BudgetItem>
              bordered
              columns={budgetColumns}
              dataSource={selectedBudget.items}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description="暂无预算项" /> }}
              pagination={false}
              rowKey="id"
              size="small"
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
            <div className="budget-section-date">{budgetDateText}</div>
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
