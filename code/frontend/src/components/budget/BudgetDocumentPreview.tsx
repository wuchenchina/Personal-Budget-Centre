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
      : (template?.titleTemplate ?? 'No budget selected');
  const budgetSubtitle =
    selectedBudget && template
      ? renderBudgetTemplateText(template.subtitleTemplate, selectedBudget)
      : 'Create or select a budget';
  const budgetDateText = selectedBudget
    ? `Date: ${selectedBudget.startDate} to ${selectedBudget.endDate}`
    : 'Date: -';

  return (
    <main className="document-workbench">
      <div className="toolbar-row">
        <Space wrap>
          <Button icon={<CalendarRange size={16} />}>Period</Button>
          <Segmented
            disabled
            value={selectedBudget?.visibility ?? 'private'}
            options={[
              { label: 'Private', value: 'private' },
              { label: 'Workspace', value: 'workspace' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
        </Space>
        <Space wrap>
          {selectedBudget ? (
            <Tag color={selectedBudget.status === 'active' ? 'green' : 'default'}>
              {selectedBudget.status}
            </Tag>
          ) : null}
          <Tag color="green">manual rates</Tag>
          <Tag>live rates later</Tag>
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
            message={templateError ? 'Template API unavailable' : 'Budget API unavailable'}
            description={templateError ?? budgetError}
          />
        </div>
      ) : isBudgetLoading ? (
        <div className="state-panel">
          <Empty description="Loading budgets..." />
        </div>
      ) : selectedBudget === null ? (
        <div className="state-panel">
          <Empty description="No budget selected" />
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
                  Add
                </Button>
              ) : null}
            </div>
            <div className="budget-section-date">{budgetDateText}</div>
            <Table<BudgetItem>
              bordered
              columns={budgetColumns}
              dataSource={selectedBudget.items}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description="No budget items" /> }}
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
                  Add
                </Button>
              ) : null}
            </div>
            <div className="budget-section-date">{budgetDateText}</div>
            <Table<Transaction>
              bordered
              columns={transactionColumns}
              dataSource={selectedBudget.transactions}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description="No transactions" /> }}
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
          <Tooltip title="Edit">
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openBudgetItemEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this highlight?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleBudgetItemDelete(row.id)}
          >
            <Tooltip title="Delete">
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
          <Tooltip title="Edit">
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openTransactionEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this transaction?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleTransactionDelete(row.id)}
          >
            <Tooltip title="Delete">
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
