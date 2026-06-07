import { useMemo } from 'react';
import { Alert, Button, Empty, Popconfirm, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { CalendarRange, Download, FileText, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import {
  budgetStatusLabelsByLanguage,
  useI18n,
  visibilityLabelsByLanguage,
} from '../../i18n';
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
  const { language, t } = useI18n();
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

      return appendBudgetItemActions(columns, canWriteBudgets, entry, {
        cancel: t('cancel'),
        delete: t('delete'),
        deleteTitle: t('deleteBudgetItemTitle'),
        edit: t('edit'),
      });
    },
    [baseCurrency, budgetHighlights, canWriteBudgets, entry, selectedBudget?.baseCurrency, t],
  );
  const transactionColumns = useMemo(
    () =>
      appendTransactionActions(
        createTransactionColumns(transactionBreakdown?.columns ?? []),
        canWriteBudgets,
        entry,
        {
          cancel: t('cancel'),
          delete: t('delete'),
          deleteTitle: t('deleteTransactionTitle'),
          edit: t('edit'),
        },
      ),
    [canWriteBudgets, entry, t, transactionBreakdown],
  );
  const budgetTitle = selectedBudget?.title ?? t('noBudgetSelected');
  const budgetSubtitle = selectedBudget?.ownerName.trim() ?? '';
  const budgetDateText = selectedBudget ? formatBudgetPeriod(selectedBudget, language) : null;
  const visibilityOptions = [
    { label: visibilityLabelsByLanguage[language].private, value: 'private' },
    { label: visibilityLabelsByLanguage[language].workspace, value: 'workspace' },
    { label: visibilityLabelsByLanguage[language].custom, value: 'custom' },
  ];

  return (
    <main className="document-workbench">
      <div className="toolbar-row">
        <Space wrap>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<CalendarRange size={16} />}
            onClick={onEditBudget}
          >
            {t('projectInfo')}
          </Button>
          <Button
            disabled={selectedBudget === null || onOpenShare === undefined}
            icon={<Share2 size={16} />}
            onClick={onOpenShare}
          >
            {t('share')}
          </Button>
          <Segmented
            disabled
            value={selectedBudget?.visibility ?? 'private'}
            options={visibilityOptions}
          />
        </Space>
        <Space wrap>
          {selectedBudget ? (
            <Tag color={selectedBudget.status === 'active' ? 'blue' : 'default'}>
              {budgetStatusLabelsByLanguage[language][selectedBudget.status]}
            </Tag>
          ) : null}
        </Space>
      </div>

      <div className="budget-export-strip">
        <div className="budget-export-actions">
          <span className="budget-export-label">
            <FileText size={15} />
            {t('export')}
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
            message={templateError ? t('templateApiUnavailable') : t('budgetApiUnavailable')}
            description={templateError ?? budgetError}
          />
        </div>
      ) : isBudgetLoading ? (
        <div className="state-panel">
          <Empty description={t('loadingBudget')} />
        </div>
      ) : selectedBudget === null ? (
        <div className="state-panel">
          <Empty description={t('noBudgetSelected')} />
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
                  {t('add')}
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">
                {t('datePrefix')}
                {budgetDateText}
              </div>
            ) : null}
            <Table<BudgetItem>
              bordered
              columns={budgetColumns}
              dataSource={selectedBudget.items}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description={t('budgetItemsEmpty')} /> }}
              pagination={false}
              rowKey="id"
              size="small"
              summary={() => renderBudgetSummary(budgetColumns, selectedBudget, t('summary'))}
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
                  {t('add')}
                </Button>
              ) : null}
            </div>
            {budgetDateText ? (
              <div className="budget-section-date">
                {t('datePrefix')}
                {budgetDateText}
              </div>
            ) : null}
            <Table<Transaction>
              bordered
              columns={transactionColumns}
              dataSource={selectedBudget.transactions}
              loading={isTemplateLoading || isBudgetDetailLoading}
              locale={{ emptyText: <Empty description={t('transactionsEmpty')} /> }}
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
  summaryLabel: string,
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
              {summaryCellContent(key, index, selectedBudget, summaryLabel)}
            </Table.Summary.Cell>
          );
        })}
      </Table.Summary.Row>
    </Table.Summary>
  );
}

function summaryCellContent(
  key: string,
  index: number,
  selectedBudget: BudgetDetail,
  summaryLabel: string,
): string {
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

  return index === 0 ? summaryLabel : '';
}

interface ActionLabels {
  cancel: string;
  delete: string;
  deleteTitle: string;
  edit: string;
}

function appendBudgetItemActions(
  columns: TableProps<BudgetItem>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  labels: ActionLabels,
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
          <Tooltip title={labels.edit}>
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openBudgetItemEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title={labels.deleteTitle}
            okText={labels.delete}
            cancelText={labels.cancel}
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleBudgetItemDelete(row.id)}
          >
            <Tooltip title={labels.delete}>
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
  labels: ActionLabels,
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
          <Tooltip title={labels.edit}>
            <Button
              icon={<Pencil size={14} />}
              size="small"
              type="text"
              onClick={() => entry.openTransactionEditModal(row)}
            />
          </Tooltip>
          <Popconfirm
            title={labels.deleteTitle}
            okText={labels.delete}
            cancelText={labels.cancel}
            okButtonProps={{ danger: true }}
            onConfirm={() => entry.handleTransactionDelete(row.id)}
          >
            <Tooltip title={labels.delete}>
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
