import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import type { TextProps } from 'antd/es/typography/Text';
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
  BudgetSignatureConfig,
  BudgetSignatureRow,
  BudgetTemplateDefinition,
  CurrencyCode,
  Transaction,
} from '../../types/budget';
import {
  createBudgetItemColumns,
  createTransactionColumns,
  effectiveBudgetItemAmounts,
  effectiveBudgetTotals,
  formatBudgetMoney,
} from '../../utils/budgetTemplate';
import { formatBudgetPeriod } from '../../utils/budgetPeriod';
import { signatureLabelForConfig } from '../../utils/budgetSignature';

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
  isBudgetSaving: boolean;
  isTemplateLoading: boolean;
  onEditBudget?: () => void;
  onInlineHeaderSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
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
  isBudgetSaving,
  isTemplateLoading,
  onEditBudget,
  onInlineHeaderSave,
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
        selectedBudget?.transactions ?? [],
      );

      return appendBudgetItemActions(
        appendQuickAmountEditors(
          columns,
          selectedBudget?.transactions ?? [],
          canWriteBudgets,
          entry,
        ),
        canWriteBudgets,
        entry,
        {
        cancel: t('cancel'),
        delete: t('delete'),
        deleteTitle: t('deleteBudgetItemTitle'),
        edit: t('edit'),
        },
      );
    },
    [
      baseCurrency,
      budgetHighlights,
      canWriteBudgets,
      entry,
      selectedBudget?.baseCurrency,
      selectedBudget?.transactions,
      t,
    ],
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
  const canInlineEditHeader =
    selectedBudget !== null
    && canWriteBudgets
    && onInlineHeaderSave !== undefined
    && !isBudgetDetailLoading
    && !isBudgetSaving;
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
          <BudgetEditableHeader
            canEdit={canInlineEditHeader}
            ownerName={budgetSubtitle}
            saving={isBudgetSaving}
            title={budgetTitle}
            onSave={onInlineHeaderSave}
          />

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

          <BudgetSignatureSection
            config={selectedBudget.signatureConfig}
            fallbackTitle={t('signatureSectionTitle')}
            labels={{ dateTime: t('dateTime') }}
          />
        </section>
      )}
    </main>
  );
}

function BudgetEditableHeader({
  canEdit,
  ownerName,
  saving,
  title,
  onSave,
}: {
  canEdit: boolean;
  ownerName: string;
  saving: boolean;
  title: string;
  onSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
}) {
  const editableTrigger: Array<'icon' | 'text'> = ['icon', 'text'];
  const titleEditable =
    canEdit && onSave !== undefined
      ? {
          autoSize: { maxRows: 2, minRows: 1 },
          maxLength: 255,
          text: title,
          tooltip: false,
          triggerType: editableTrigger,
          onChange: (value: string) => {
            void onSave({ title: value });
          },
        } satisfies TextProps['editable']
      : false;
  const ownerEditable =
    canEdit && onSave !== undefined
      ? {
          autoSize: { maxRows: 2, minRows: 1 },
          maxLength: 160,
          text: ownerName,
          tooltip: false,
          triggerType: editableTrigger,
          onChange: (value: string) => {
            void onSave({ ownerName: value });
          },
        } satisfies TextProps['editable']
      : false;

  return (
    <div className="budget-document-heading" aria-busy={saving}>
      <Typography.Title
        className="budget-document-title"
        editable={titleEditable}
        level={1}
      >
        {title}
      </Typography.Title>
      {ownerName || canEdit ? (
        <Typography.Paragraph
          className="budget-document-subtitle"
          editable={ownerEditable}
        >
          {ownerName || ' '}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
}

function BudgetSignatureSection({
  config,
  fallbackTitle,
  labels,
}: {
  config: BudgetSignatureConfig;
  fallbackTitle: string;
  labels: {
    dateTime: string;
  };
}) {
  if (!config.enabled || config.rows.length === 0) {
    return null;
  }

  return (
    <div className={`budget-signature-section budget-signature-section-${config.sectionAlign}`}>
      <div className="budget-signature-title">{config.title || fallbackTitle}</div>
      <div className="budget-signature-grid">
        {config.rows.map((row) => (
          <BudgetSignatureCard
            config={config}
            key={row.id}
            labels={labels}
            row={row}
          />
        ))}
      </div>
    </div>
  );
}

function appendQuickAmountEditors(
  columns: TableProps<BudgetItem>['columns'],
  transactions: Transaction[],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
): TableProps<BudgetItem>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  return columns.map((column) => {
    const key = String(column.key ?? '');
    if (!['budget', 'estimated_actuals', 'variance'].includes(key)) {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: BudgetItem) => {
        const effective = effectiveBudgetItemAmounts(row, transactions);
        const isSameCurrency = row.budget.currency === row.estimatedActuals.currency;
        const editable = canWriteBudgets && isSameCurrency;
        const currency = key === 'variance' ? row.budget.currency : (
          key === 'budget' ? row.budget.currency : row.estimatedActuals.currency
        );
        const value = key === 'budget'
          ? effective.budgetAmountOriginal
          : key === 'estimated_actuals'
            ? effective.estimatedAmountOriginal
            : effective.budgetAmountOriginal - effective.estimatedAmountOriginal;

        return (
          <InlineMoneyCell
            currency={currency}
            disabled={entry.isBudgetItemSaving}
            editable={editable}
            value={value}
            onCommit={(nextValue) => {
              void entry.handleBudgetItemQuickAmountSave(row, key, nextValue);
            }}
          />
        );
      },
    };
  });
}

function InlineMoneyCell({
  currency,
  disabled,
  editable,
  value,
  onCommit,
}: {
  currency: CurrencyCode;
  disabled: boolean;
  editable: boolean;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState<number | null>(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  if (!editable) {
    return formatBudgetMoney(currency, value);
  }

  const commit = () => {
    if (draftValue === null || !Number.isFinite(draftValue)) {
      setDraftValue(value);

      return;
    }

    if (Math.abs(draftValue - value) >= 0.005) {
      onCommit(draftValue);
    }
  };

  return (
    <span className="budget-inline-money-cell">
      <span>{currency}</span>
      <InputNumber
        changeOnWheel={false}
        className="budget-inline-money-input"
        controls={false}
        disabled={disabled}
        precision={2}
        size="small"
        value={draftValue}
        variant="borderless"
        onBlur={commit}
        onChange={(nextValue) => setDraftValue(typeof nextValue === 'number' ? nextValue : null)}
        onPressEnter={commit}
      />
    </span>
  );
}

function BudgetSignatureCard({
  config,
  labels,
  row,
}: {
  config: BudgetSignatureConfig;
  labels: {
    dateTime: string;
  };
  row: BudgetSignatureRow;
}) {
  const signatureLabel = signatureLabelForConfig(config);
  const dateTimeText = row.signedAt ?? currentDateTimeText();

  return (
    <div className="budget-signature-card">
      {row.showRole && row.roleLabel ? (
        <div className="budget-signature-role">{row.roleLabel}</div>
      ) : null}
      {row.showName && row.displayName ? (
        <div className="budget-signature-line">{row.displayName}</div>
      ) : null}
      {row.showPosition && row.position ? (
        <div className="budget-signature-line">{row.position}</div>
      ) : null}
      {row.showEmail && row.email ? (
        <div className="budget-signature-line">{row.email}</div>
      ) : null}
      {row.showSignature ? (
        <div className="budget-signature-box">
          <span>{signatureLabel}</span>
        </div>
      ) : null}
      {row.showDateTime ? (
        <div className="budget-signature-date">
          {labels.dateTime}: {dateTimeText}
        </div>
      ) : null}
    </div>
  );
}

function currentDateTimeText(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-')
    + ' '
    + [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join(':');
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
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalBudgetBase,
    );
  }

  if (key === 'estimated_actuals') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalEstimatedBase,
    );
  }

  if (key === 'variance') {
    return formatBudgetMoney(
      selectedBudget.baseCurrency,
      effectiveBudgetTotals(selectedBudget).totalVarianceBase,
    );
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
