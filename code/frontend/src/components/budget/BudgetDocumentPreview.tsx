import type { KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
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
import {
  CalendarRange,
  Check,
  Download,
  FileText,
  Pencil,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
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
import { signatureLabelForConfig, signatureRoleForDisplay } from '../../utils/budgetSignature';

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
            labels={{
              cancel: t('cancel'),
              edit: t('edit'),
              save: t('save'),
            }}
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
            labels={{
              capacity: t('capacity'),
              dateTime: t('dateTime'),
              email: t('email'),
              participant: t('signatureParticipant'),
              position: t('position'),
            }}
          />
        </section>
      )}
    </main>
  );
}

function BudgetEditableHeader({
  canEdit,
  labels,
  ownerName,
  saving,
  title,
  onSave,
}: {
  canEdit: boolean;
  labels: {
    cancel: string;
    edit: string;
    save: string;
  };
  ownerName: string;
  saving: boolean;
  title: string;
  onSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
}) {
  const [editingField, setEditingField] = useState<'title' | 'ownerName' | null>(null);
  const [titleDraft, setTitleDraft] = useState(title);
  const [ownerNameDraft, setOwnerNameDraft] = useState(ownerName);

  const startEditing = (field: 'title' | 'ownerName') => {
    if (!canEdit || saving) {
      return;
    }

    if (field === 'title') {
      setTitleDraft(title);
    } else {
      setOwnerNameDraft(ownerName);
    }
    setEditingField(field);
  };
  const cancelEditing = () => {
    setTitleDraft(title);
    setOwnerNameDraft(ownerName);
    setEditingField(null);
  };
  const saveField = async (field: 'title' | 'ownerName') => {
    if (onSave === undefined || saving) {
      return;
    }

    const value = field === 'title' ? titleDraft : ownerNameDraft;
    if (field === 'title' && value.trim() === '') {
      return;
    }

    await onSave(field === 'title' ? { title: value } : { ownerName: value });
    setEditingField(null);
  };
  const handleEditorKeyDown = (field: 'title' | 'ownerName') => (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();

      return;
    }
    if (event.key !== 'Enter' || event.altKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void saveField(field);
  };
  const renderEditActions = (field: 'title' | 'ownerName') => (
    <Space size={2} className="budget-document-edit-actions">
      <Tooltip title={labels.save}>
        <Button
          icon={<Check size={13} />}
          loading={saving}
          size="small"
          type="text"
          onClick={() => {
            void saveField(field);
          }}
        />
      </Tooltip>
      <Tooltip title={labels.cancel}>
        <Button
          disabled={saving}
          icon={<X size={13} />}
          size="small"
          type="text"
          onClick={cancelEditing}
        />
      </Tooltip>
    </Space>
  );

  return (
    <div className="budget-document-heading" aria-busy={saving}>
      {editingField === 'title' ? (
        <div className="budget-document-editor-row budget-document-title-editor-row">
          <Input.TextArea
            autoFocus
            autoSize={{ maxRows: 4, minRows: 1 }}
            className="budget-document-title-editor"
            maxLength={255}
            value={titleDraft}
            variant="borderless"
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown('title')}
          />
          {renderEditActions('title')}
        </div>
      ) : (
        <Typography.Title className="budget-document-title" level={1}>
          <span
            className="budget-document-text"
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : undefined}
            onClick={() => startEditing('title')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                startEditing('title');
              }
            }}
          >
            {title}
          </span>
          {canEdit ? (
            <Tooltip title={labels.edit}>
              <Button
                icon={<Pencil size={13} />}
                size="small"
                type="text"
                onClick={() => startEditing('title')}
              />
            </Tooltip>
          ) : null}
        </Typography.Title>
      )}
      {ownerName || canEdit ? (
        editingField === 'ownerName' ? (
          <div className="budget-document-editor-row budget-document-subtitle-editor-row">
            <Input.TextArea
              autoFocus
              autoSize={{ maxRows: 2, minRows: 1 }}
              className="budget-document-subtitle-editor"
              maxLength={160}
              value={ownerNameDraft}
              variant="borderless"
              onChange={(event) => setOwnerNameDraft(event.target.value)}
              onKeyDown={handleEditorKeyDown('ownerName')}
            />
            {renderEditActions('ownerName')}
          </div>
        ) : (
          <Typography.Paragraph className="budget-document-subtitle">
            <span
              className="budget-document-text"
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={() => startEditing('ownerName')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  startEditing('ownerName');
                }
              }}
            >
              {ownerName || ' '}
            </span>
            {canEdit ? (
              <Tooltip title={labels.edit}>
                <Button
                  icon={<Pencil size={13} />}
                  size="small"
                  type="text"
                  onClick={() => startEditing('ownerName')}
                />
              </Tooltip>
            ) : null}
          </Typography.Paragraph>
        )
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
    capacity: string;
    dateTime: string;
    email: string;
    participant: string;
    position: string;
  };
}) {
  if (!config.enabled || config.rows.length === 0) {
    return null;
  }

  const isSingleFullWidth = config.rows.length === 1 && config.sectionAlign !== 'right';

  return (
    <div
      className={[
        'budget-signature-section',
        `budget-signature-section-${config.sectionAlign}`,
        isSingleFullWidth ? 'budget-signature-section-single' : '',
      ].filter(Boolean).join(' ')}
    >
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
  const [draftState, setDraftState] = useState<{ sourceValue: number; draftValue: number | null }>({
    sourceValue: value,
    draftValue: value,
  });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const setDraftValue = (nextValue: number | null) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

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
    capacity: string;
    dateTime: string;
    email: string;
    participant: string;
    position: string;
  };
  row: BudgetSignatureRow;
}) {
  const signatureLabel = signatureLabelForConfig(config);
  const dateTimeText = row.signedAt ?? currentDateTimeText();
  const metaRows = [
    row.showName && row.displayName
      ? { label: labels.participant, value: row.displayName }
      : null,
    row.showRole && row.roleLabel
      ? { label: labels.capacity, value: signatureRoleForDisplay(config, row.roleLabel) }
      : null,
    row.showPosition && row.position
      ? { label: labels.position, value: row.position }
      : null,
    row.showEmail && row.email
      ? { label: labels.email, value: row.email }
      : null,
    ...(row.customFields ?? [])
      .filter((field) => field.show !== false && (field.label.trim() !== '' || field.value.trim() !== ''))
      .map((field) => ({ label: field.label, value: field.value })),
    row.showDateTime
      ? { label: labels.dateTime, value: dateTimeText }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <div className="budget-signature-card">
      <div className="budget-signature-info">
        {metaRows.map((item, index) => (
          <div className="budget-signature-meta" key={`${item.label}-${index}`}>
            <span className="budget-signature-meta-label">{item.label}</span>
            <span className="budget-signature-meta-value">{item.value}</span>
          </div>
        ))}
      </div>
      <div className="budget-signature-sign">
        {row.showSignature ? (
          <div className="budget-signature-box">
            {config.showControlText !== false ? (
              <span className="budget-signature-security">BUDGETCENTRE CONFIRMATION CONTROL</span>
            ) : null}
            <span className="budget-signature-box-space">
              <span className="budget-signature-watermark">CONFIRMATION</span>
            </span>
            <span className="budget-signature-rule" />
            <span className="budget-signature-box-label">{signatureLabel}</span>
          </div>
        ) : null}
      </div>
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
