import type { CSSProperties, KeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
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
  Signature,
  Trash2,
  X,
} from 'lucide-react';
import { currencyOptions } from '../../config/appConfig';
import type { BudgetEntryController } from '../../hooks/useBudgetEntryController';
import type { OperationsController } from '../../hooks/useOperationsController';
import {
  budgetStatusLabelsByLanguage,
  type I18nKey,
  type I18nValues,
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
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';
import { formatBudgetPeriodEnglish } from '../../utils/budgetPeriod';
import { installmentSummary } from '../../utils/budgetInstallments';
import {
  signatureInfoLanguage,
  signatureLabelForConfig,
  signatureMetaLabelsForLanguage,
  signatureCustomFieldLabelForDisplay,
  signaturePositionForDisplay,
  signatureRoleForDisplay,
  signatureTitleForDisplay,
} from '../../utils/budgetSignature';

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
  onEditInstallments?: () => void;
  onEditSignature?: () => void;
  onInlineHeaderSave?: (values: { title?: string; ownerName?: string }) => Promise<void>;
  onOpenShare?: () => void;
  operations: OperationsController;
  categoryOptions: Array<{ label: string; value: number }>;
  transactionCategoryOptions: Array<{ label: string; value: number }>;
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
  onEditInstallments,
  onEditSignature,
  onInlineHeaderSave,
  onOpenShare,
  operations,
  categoryOptions,
  transactionCategoryOptions,
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
          appendBudgetItemCategoryEditors(columns, canWriteBudgets, entry, categoryOptions),
          selectedBudget?.transactions ?? [],
          canWriteBudgets,
          entry,
          selectedBudget?.baseCurrency ?? baseCurrency,
          t('edit'),
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
      categoryOptions,
      entry,
      selectedBudget?.baseCurrency,
      selectedBudget?.transactions,
      t,
    ],
  );
  const transactionColumns = useMemo(
    () =>
      appendTransactionActions(
        appendTransactionQuickEditors(
          createTransactionColumns(transactionBreakdown?.columns ?? []),
          canWriteBudgets,
          entry,
          transactionCategoryOptions,
          selectedBudget?.baseCurrency ?? baseCurrency,
          t('referenceShort'),
        ),
        canWriteBudgets,
        entry,
        {
          cancel: t('cancel'),
          delete: t('delete'),
          deleteTitle: t('deleteTransactionTitle'),
          edit: t('edit'),
        },
      ),
    [
      baseCurrency,
      canWriteBudgets,
      entry,
      selectedBudget?.baseCurrency,
      t,
      transactionBreakdown,
      transactionCategoryOptions,
    ],
  );
  const budgetTitle = selectedBudget?.title ?? t('noBudgetSelected');
  const budgetSubtitle = selectedBudget?.ownerName.trim() ?? '';
  const budgetDateText = selectedBudget ? formatBudgetPeriodEnglish(selectedBudget) : null;
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
  const installmentRows = selectedBudget === null ? [] : createInstallmentEstimateRows(selectedBudget, t);
  const installmentPeriodLabel = installmentPeriodUnitLabel(
    selectedBudget?.installmentPeriodUnit ?? 'month',
    t,
  );
  const installmentColumns = createInstallmentEstimateColumns(
    installmentPeriodLabel,
    {
      category: 'Category',
      duration: t('installmentDuration'),
      periodAmount: t('installmentPeriodAmount'),
      progress: t('installmentProgress'),
      targetAmount: t('installmentTargetAmount'),
    },
  );

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
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<Signature size={16} />}
            onClick={onEditSignature}
          >
            {t('signatureSettings')}
          </Button>
          <Button
            disabled={selectedBudget === null || !canWriteBudgets}
            icon={<CalendarRange size={16} />}
            onClick={onEditInstallments}
          >
            {t('installmentOptions')}
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
                Date:
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
              summary={() => renderBudgetSummary(budgetColumns, selectedBudget, t('totalBudgetLabel'))}
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
                Date:
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

          {selectedBudget.budgetType === 'installment' ? (
            <div className="budget-table-frame">
              <div className="budget-section-title budget-section-title-row">
                <span>{t('installmentSectionTitle')}</span>
                <Tag color="blue">{t('installmentBudget')}</Tag>
              </div>
              {budgetDateText ? (
                <div className="budget-section-date">
                  Date:
                  {budgetDateText}
                </div>
              ) : null}
              <Table<InstallmentEstimateRow>
                bordered
                columns={installmentColumns}
                dataSource={installmentRows}
                loading={isTemplateLoading || isBudgetDetailLoading}
                locale={{ emptyText: <Empty description={t('installmentRowsEmpty')} /> }}
                pagination={false}
                rowKey="id"
                size="small"
                summary={() => renderInstallmentSummary(
                  createInstallmentSummaryValues(selectedBudget, installmentRows),
                  t('totalBudgetLabel'),
                )}
                tableLayout="fixed"
              />
            </div>
          ) : null}

          <BudgetSignatureSection
            config={selectedBudget.signatureConfig}
            fallbackTitle={t('signatureSectionTitle')}
            onEdit={canWriteBudgets ? onEditSignature : undefined}
          />
        </section>
      )}
    </main>
  );
}

interface InstallmentEstimateRow {
  id: number;
  category: string;
  durationText: string;
  periodAmount: string;
  periodAmountBase: number;
  progressText: string;
  targetAmount: string;
  targetAmountBase: number;
}

interface InstallmentSummaryValues {
  currency: CurrencyCode;
  periodTotal: number;
  targetTotal: number;
}

function createInstallmentEstimateColumns(
  periodUnitLabel: string,
  labels: {
    category: string;
    duration: string;
    periodAmount: string;
    progress: string;
    targetAmount: string;
  },
): TableProps<InstallmentEstimateRow>['columns'] {
  return [
    {
      dataIndex: 'category',
      key: 'category',
      title: labels.category,
      width: '32%',
    },
    {
      align: 'right',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      title: labels.targetAmount,
      width: '18%',
    },
    {
      align: 'right',
      dataIndex: 'periodAmount',
      key: 'periodAmount',
      title: labels.periodAmount,
      width: '20%',
      render: (value: string) => (
        <span className="budget-installment-period-amount">
          {value}
          <small>{periodUnitLabel}</small>
        </span>
      ),
    },
    {
      dataIndex: 'durationText',
      key: 'durationText',
      title: labels.duration,
      width: '15%',
    },
    {
      dataIndex: 'progressText',
      key: 'progressText',
      title: labels.progress,
      width: '15%',
    },
  ];
}

function createInstallmentEstimateRows(
  budget: BudgetDetail,
  t: (key: I18nKey, values?: I18nValues) => string,
): InstallmentEstimateRow[] {
  return budget.items.map((item) => {
    const configuredMonths = item.installmentConfig.enabled ? item.installmentConfig.months : null;
    const durationMonths =
      configuredMonths ?? budgetDurationMonths(budget.startDate, budget.endDate) ?? 1;
    const targetAmount = installmentTargetAmount(item);
    const periodCount = Math.max(1, periodCountFromMonths(durationMonths, budget.installmentPeriodUnit));
    const periodAmount = targetAmount / periodCount;
    const targetAmountBase = item.budget.rateToBase > 0
      ? targetAmount * item.budget.rateToBase
      : targetAmount;
    const paidMonths = item.installmentConfig.enabled ? item.installmentConfig.paidMonths : 0;

    return {
      id: item.id,
      category: item.category ?? item.label,
      durationText: t('installmentDurationMonths', { count: roundDisplay(durationMonths) }),
      periodAmount: formatBudgetMoney(item.budget.currency, periodAmount),
      periodAmountBase: targetAmountBase / periodCount,
      progressText:
        configuredMonths === null
          ? '--'
          : `${paidMonths}/${configuredMonths}`,
      targetAmount: formatBudgetMoney(item.budget.currency, targetAmount),
      targetAmountBase,
    };
  });
}

function createInstallmentSummaryValues(
  budget: BudgetDetail,
  rows: InstallmentEstimateRow[],
): InstallmentSummaryValues | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    currency: budget.baseCurrency,
    targetTotal: rows.reduce((total, row) => total + row.targetAmountBase, 0),
    periodTotal: rows.reduce((total, row) => total + row.periodAmountBase, 0),
  };
}

function installmentTargetAmount(item: BudgetItem): number {
  const summary = installmentSummary(item.installmentConfig);

  return item.installmentConfig.enabled && summary.totalAmount !== null && summary.totalAmount > 0
    ? summary.totalAmount
    : item.budget.amountOriginal;
}

function renderInstallmentSummary(values: InstallmentSummaryValues | null, summaryLabel: string) {
  if (values === null) {
    return null;
  }

  return (
    <Table.Summary>
      <Table.Summary.Row className="budget-summary-row">
        <Table.Summary.Cell index={0}>{summaryLabel}</Table.Summary.Cell>
        <Table.Summary.Cell className="budget-summary-number" index={1}>
          {formatBudgetMoney(values.currency, values.targetTotal)}
        </Table.Summary.Cell>
        <Table.Summary.Cell className="budget-summary-number" index={2}>
          {formatBudgetMoney(values.currency, values.periodTotal)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={3} />
        <Table.Summary.Cell index={4} />
      </Table.Summary.Row>
    </Table.Summary>
  );
}

function budgetDurationMonths(startDate: string | null, endDate: string | null): number | null {
  if (startDate === null || endDate === null) {
    return null;
  }

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return null;
  }

  return Math.max(1, (end.diff(start, 'day') + 1) / 30.4375);
}

function periodCountFromMonths(months: number, unit: BudgetDetail['installmentPeriodUnit']): number {
  if (unit === 'day') {
    return months * (365 / 12);
  }

  if (unit === 'week') {
    return months * (52 / 12);
  }

  if (unit === 'year') {
    return months / 12;
  }

  return months;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function installmentPeriodUnitLabel(
  unit: BudgetDetail['installmentPeriodUnit'],
  t: (key: I18nKey) => string,
): string {
  const keyByUnit: Record<BudgetDetail['installmentPeriodUnit'], I18nKey> = {
    day: 'installmentPeriodDay',
    week: 'installmentPeriodWeek',
    month: 'installmentPeriodMonth',
    year: 'installmentPeriodYear',
  };

  return t(keyByUnit[unit]);
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
  onEdit,
}: {
  config: BudgetSignatureConfig;
  fallbackTitle: string;
  onEdit?: () => void;
}) {
  if (!config.enabled || config.rows.length === 0) {
    return null;
  }

  const isSingleFullWidth = config.rows.length === 1 && config.sectionAlign !== 'right';
  const labels = signatureMetaLabelsForLanguage(signatureInfoLanguage(config));
  const signingRows = config.rows.filter((row) => row.showSignature !== false);
  const noteRows = config.rows.filter((row) => row.showSignature === false);
  const title = signatureTitleForDisplay(config, fallbackTitle);

  return (
    <div
      className={[
        'budget-signature-section',
        `budget-signature-section-${config.sectionAlign}`,
        isSingleFullWidth ? 'budget-signature-section-single' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="budget-signature-title">
        <span>{title}</span>
        {onEdit ? (
          <Tooltip title="Edit">
            <Button
              icon={<Pencil size={12} />}
              size="small"
              type="text"
              onClick={onEdit}
            />
          </Tooltip>
        ) : null}
      </div>
      <div className="budget-signature-grid">
        {signingRows.map((row) => (
          <BudgetSignatureCard
            config={config}
            key={row.id}
            labels={labels}
            row={row}
          />
        ))}
        {noteRows.length > 0 ? (
          <BudgetSignatureNotesBlock config={config} labels={labels} rows={noteRows} />
        ) : null}
      </div>
    </div>
  );
}

function appendQuickAmountEditors(
  columns: TableProps<BudgetItem>['columns'],
  transactions: Transaction[],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  baseCurrency: CurrencyCode,
  editLabel: string,
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
        const editable = canWriteBudgets;
        const isEstimatedActuals = key === 'estimated_actuals';
        const currency = key === 'budget' ? row.budget.currency : baseCurrency;
        const value = key === 'budget'
          ? effective.budgetAmountOriginal
          : key === 'estimated_actuals'
            ? effective.estimatedAmountBase
            : effective.varianceBase;
        const editFocus = key === 'budget' ? 'budget' : key === 'variance' ? 'variance' : null;

        return (
          <InlineMoneyCell
            currency={currency}
            disabled={entry.isBudgetItemSaving}
            editable={editable && !isEstimatedActuals}
            editLabel={editLabel}
            secondaryText={secondaryTextForBudgetCell(row, key, effective, baseCurrency, value)}
            value={value}
            onEdit={isEstimatedActuals ? undefined : () => entry.openBudgetItemEditModal(row, editFocus)}
            onCommit={(nextValue) => {
              void entry.handleBudgetItemQuickAmountSave(row, key, nextValue);
            }}
          />
        );
      },
    };
  });
}

function appendBudgetItemCategoryEditors(
  columns: TableProps<BudgetItem>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  categoryOptions: Array<{ label: string; value: number }>,
): TableProps<BudgetItem>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  return columns.map((column) => {
    if (String(column.key ?? '') !== 'category') {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: BudgetItem) => (
        <InlineCategoryCell
          categoryOptions={categoryOptions}
          disabled={entry.isBudgetItemSaving}
          editable={canWriteBudgets}
          row={row}
          onEdit={() => entry.openBudgetItemEditModal(row, 'category')}
          onSave={(categoryId, label) => {
            void entry.handleBudgetItemCategoryQuickSave(row, categoryId, label);
          }}
        />
      ),
    };
  });
}

function InlineCategoryCell({
  categoryOptions,
  disabled,
  editable,
  row,
  onEdit,
  onSave,
}: {
  categoryOptions: Array<{ label: string; value: number }>;
  disabled: boolean;
  editable: boolean;
  row: BudgetItem;
  onEdit: () => void;
  onSave: (categoryId: number | null, label: string) => void;
}) {
  const { t } = useI18n();
  const label = row.category ?? row.label;
  const summary = budgetInstallmentNode(row);

  if (!editable) {
    return (
      <div className="budget-item-category-cell">
        <span>{label}</span>
        {summary}
      </div>
    );
  }

  return (
    <div className="budget-category-quick-cell">
      <Select
        allowClear
        className="budget-category-quick-select"
        disabled={disabled}
        optionFilterProp="label"
        options={categoryOptions}
        placeholder={t('selectCategory')}
        showSearch
        size="small"
        value={row.categoryId ?? undefined}
        variant="borderless"
        onChange={(value) => {
          const option = categoryOptions.find((item) => item.value === value);
          onSave(value ?? null, option?.label ?? row.label);
        }}
      />
      <Tooltip title={t('edit')}>
        <Button
          icon={<Pencil size={12} />}
          size="small"
          type="text"
          onClick={onEdit}
        />
      </Tooltip>
      {summary}
    </div>
  );
}

function budgetInstallmentNode(row: BudgetItem) {
  const summary = installmentSummary(row.installmentConfig);
  if (!summary.isEnabled || summary.monthlyAmount === null || row.installmentConfig.months === null) {
    return null;
  }

  return (
    <span className="budget-installment-summary">
      {`${formatBudgetMoney(row.budget.currency, summary.monthlyAmount)} / month, ${
        row.installmentConfig.paidMonths
      }/${row.installmentConfig.months} saved${
        summary.remainingMonths === null ? '' : `, ${summary.remainingMonths} remaining`
      }`}
    </span>
  );
}

function InlineMoneyCell({
  currency,
  currencyOptions,
  disabled,
  editable,
  editLabel,
  secondaryText,
  value,
  onCurrencyCommit,
  onEdit,
  onCommit,
}: {
  currency: CurrencyCode;
  currencyOptions?: Array<{ label: string; value: CurrencyCode }>;
  disabled: boolean;
  editable: boolean;
  secondaryText?: string | null;
  value: number;
  onCurrencyCommit?: (currency: CurrencyCode) => void;
  onEdit?: () => void;
  editLabel?: string;
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
    return (
      <span className="budget-inline-money-readonly">
        <span>{formatBudgetMoney(currency, value)}</span>
        {secondaryText ? <small>{secondaryText}</small> : null}
      </span>
    );
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
    <span className="budget-inline-money-wrap">
      <span className="budget-inline-money-cell">
        {currencyOptions && onCurrencyCommit ? (
          <Select<CurrencyCode>
            className="budget-inline-currency-select"
            disabled={disabled}
            options={currencyOptions}
            size="small"
            value={currency}
            variant="borderless"
            onChange={(nextCurrency) => onCurrencyCommit(nextCurrency)}
          />
        ) : (
          <span>{currency}</span>
        )}
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
        {onEdit ? (
          <Tooltip title={editLabel ?? 'Edit'}>
            <Button
              icon={<Pencil size={12} />}
              size="small"
              type="text"
              onClick={onEdit}
            />
          </Tooltip>
        ) : null}
      </span>
      {secondaryText ? <small>{secondaryText}</small> : null}
    </span>
  );
}

function secondaryTextForBudgetCell(
  row: BudgetItem,
  key: string,
  effective: ReturnType<typeof effectiveBudgetItemAmounts>,
  baseCurrency: CurrencyCode,
  value: number,
): string | null {
  if (key === 'variance') {
    return null;
  }

  if (key === 'estimated_actuals') {
    return transactionTotalsText(effective.estimatedTransactionTotals, baseCurrency);
  }

  const leg = key === 'budget' ? row.budget : row.estimatedActuals;
  if (leg.currency === baseCurrency) {
    return null;
  }

  const baseAmount = key === 'budget'
    ? effective.budgetAmountBase
    : effective.estimatedAmountBase;
  const expectedBase = roundMoney(value * leg.rateToBase);
  if (Math.abs(baseAmount - expectedBase) < 0.005) {
    return formatBudgetMoney(baseCurrency, expectedBase);
  }

  return formatBudgetMoney(baseCurrency, baseAmount);
}

function transactionTotalsText(
  totals: TransactionCurrencyTotal[],
  baseCurrency: CurrencyCode,
): string | null {
  if (totals.length === 0) {
    return null;
  }

  if (totals.length === 1 && totals[0].currency === baseCurrency) {
    return null;
  }

  return totals
    .map((total) => formatBudgetMoney(total.currency, total.amountOriginal))
    .join(' · ');
}

function transactionSecondaryText(
  row: Transaction,
  baseCurrency: CurrencyCode,
  referenceLabel: string,
): string | null {
  const lines: string[] = [];
  if (row.currency !== baseCurrency) {
    lines.push(formatBudgetMoney(baseCurrency, row.amountBase));
  }

  if (typeof row.referenceCurrency === 'string' && typeof row.referenceAmountOriginal === 'number') {
    lines.push(`${referenceLabel} ${formatBudgetMoney(row.referenceCurrency, row.referenceAmountOriginal)}`);
  }

  return lines.length === 0 ? null : lines.join(' · ');
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function appendTransactionQuickEditors(
  columns: TableProps<Transaction>['columns'],
  canWriteBudgets: boolean,
  entry: BudgetEntryController,
  categoryOptions: Array<{ label: string; value: number }>,
  baseCurrency: CurrencyCode,
  referenceLabel: string,
): TableProps<Transaction>['columns'] {
  if (columns === undefined) {
    return columns;
  }

  return columns.map((column) => {
    const key = String(column.key ?? '');
    if (key === 'category') {
      return {
        ...column,
        render: (_value: unknown, row: Transaction) => (
          <InlineTransactionCategoryCell
            categoryOptions={categoryOptions}
            disabled={entry.isTransactionSaving}
            editable={canWriteBudgets}
            row={row}
            onSave={(categoryId) => {
              void entry.handleTransactionCategoryQuickSave(row, categoryId);
            }}
          />
        ),
      };
    }

    if (key === 'remark') {
      return {
        ...column,
        render: (_value: unknown, row: Transaction) => (
          <InlineTransactionRemarkCell
            disabled={entry.isTransactionSaving}
            editable={canWriteBudgets}
            value={row.remark ?? ''}
            onCommit={(nextValue) => {
              void entry.handleTransactionQuickRemarkSave(row, nextValue);
            }}
          />
        ),
      };
    }

    if (key !== 'amount') {
      return column;
    }

    return {
      ...column,
      render: (_value: unknown, row: Transaction) => (
        <InlineMoneyCell
          currency={row.currency}
          currencyOptions={currencyOptions}
          disabled={entry.isTransactionSaving}
          editable={canWriteBudgets}
          secondaryText={transactionSecondaryText(row, baseCurrency, referenceLabel)}
          value={row.amountOriginal}
          onCurrencyCommit={(nextCurrency) => {
            void entry.handleTransactionQuickCurrencySave(row, nextCurrency);
          }}
          onEdit={() => entry.openTransactionEditModal(row)}
          onCommit={(nextValue) => {
            void entry.handleTransactionQuickAmountSave(row, nextValue);
          }}
        />
      ),
    };
  });
}

function InlineTransactionCategoryCell({
  categoryOptions,
  disabled,
  editable,
  row,
  onSave,
}: {
  categoryOptions: Array<{ label: string; value: number }>;
  disabled: boolean;
  editable: boolean;
  row: Transaction;
  onSave: (categoryId: number) => void;
}) {
  const { t } = useI18n();

  if (!editable) {
    return row.category ?? '';
  }

  return (
    <div className="budget-category-quick-cell">
      <Select
        className="budget-category-quick-select"
        disabled={disabled}
        optionFilterProp="label"
        options={categoryOptions}
        placeholder={t('selectCategory')}
        showSearch
        size="small"
        value={row.categoryId ?? undefined}
        variant="borderless"
        onChange={(value) => {
          if (typeof value === 'number') {
            onSave(value);
          }
        }}
      />
    </div>
  );
}

function InlineTransactionRemarkCell({
  disabled,
  editable,
  value,
  onCommit,
}: {
  disabled: boolean;
  editable: boolean;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  const [draftState, setDraftState] = useState({ sourceValue: value, draftValue: value });
  const draftValue = draftState.sourceValue === value ? draftState.draftValue : value;
  const normalizedValue = value.trim();
  const setDraftValue = (nextValue: string) => {
    setDraftState({ sourceValue: value, draftValue: nextValue });
  };

  if (!editable) {
    return <span className="budget-inline-remark-readonly">{value}</span>;
  }

  const commit = () => {
    const nextValue = draftValue.trim();
    if (nextValue !== normalizedValue) {
      onCommit(draftValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setDraftValue(value);
      event.currentTarget.blur();
    }
  };

  return (
    <Input.TextArea
      allowClear
      autoComplete="off"
      autoSize={{ maxRows: 3, minRows: 1 }}
      className="budget-inline-remark-input"
      disabled={disabled}
      maxLength={500}
      placeholder={t('remark')}
      value={draftValue}
      variant="borderless"
      onBlur={commit}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

function BudgetSignatureCard({
  config,
  labels,
  row,
}: {
  config: BudgetSignatureConfig;
  labels: SignatureMetaLabels;
  row: BudgetSignatureRow;
}) {
  const signatureLabel = signatureLabelForConfig(config);
  const signatureLabelLines = signatureLabel.split('\n');
  const metaRows = signatureMetaRows(row, labels, config);

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
          <div className={`budget-signature-box budget-signature-label-${config.labelAlign}`}>
            <span className="budget-signature-box-space" />
            <span className="budget-signature-rule" />
            <span className="budget-signature-box-label">
              {signatureLabelLines.map((line, index) => (
                <span key={`${line}-${index}`}>{line}</span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BudgetSignatureNotesBlock({
  config,
  labels,
  rows,
}: {
  config: BudgetSignatureConfig;
  labels: SignatureMetaLabels;
  rows: BudgetSignatureRow[];
}) {
  const noteItems = rows
    .map((row) => signatureCompactNoteItem(row, labels, config))
    .filter((item) => item.primaryValue || item.details.length > 0);
  const noteGridStyle = {
    '--signature-note-columns': String(signatureNoteColumnCount(noteItems)),
  } as CSSProperties;

  if (noteItems.length === 0) {
    return null;
  }

  return (
    <div className="budget-signature-notes-block" style={noteGridStyle}>
      {noteItems.map((item) => (
        <div className="budget-signature-note-row" key={item.id}>
          <BudgetSignatureNoteField
            className="budget-signature-note-primary"
            item={{ label: item.primaryLabel, value: item.primaryValue }}
          />
          {item.details.length > 0 ? (
            <span className="budget-signature-note-details">
              {item.details.map((detail, index) => (
                <BudgetSignatureNoteField item={detail} key={`${detail.label}-${index}`} />
              ))}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BudgetSignatureNoteField({
  className,
  item,
}: {
  className?: string;
  item: { label: string; value: string };
}) {
  const label = item.label.trim();
  const value = item.value.trim();

  return (
    <span className={['budget-signature-note-field', className].filter(Boolean).join(' ')}>
      {label ? <span className="budget-signature-note-label">{label}</span> : null}
      {value ? <span className="budget-signature-note-value">{value}</span> : null}
    </span>
  );
}

type SignatureNoteItem = {
  id: string;
  primaryLabel: string;
  primaryValue: string;
  details: Array<{ label: string; value: string }>;
  hasDateTime: boolean;
};

type SignatureMetaLabels = {
  name: string;
  capacity: string;
  dateTime: string;
  email: string;
  position: string;
  telephone: string;
  mobile: string;
};

function signatureMetaRows(
  row: BudgetSignatureRow,
  labels: SignatureMetaLabels,
  config: BudgetSignatureConfig,
): Array<{ label: string; value: string }> {
  const dateTimeText = row.signedAt ?? currentDateTimeText();

  return [
    row.showName && row.displayName
      ? { label: labels.name, value: row.displayName }
      : null,
    row.showRole && row.roleLabel
      ? { label: labels.capacity, value: signatureRoleForDisplay(config, row.roleLabel) }
      : null,
    row.showPosition && row.position
      ? { label: labels.position, value: signaturePositionForDisplay(config, row.position) }
      : null,
    row.showEmail && row.email
      ? { label: labels.email, value: row.email }
      : null,
    ...(row.customFields ?? [])
      .filter((field) => field.show !== false && (field.label.trim() !== '' || field.value.trim() !== ''))
      .map((field) => ({
        label: signatureCustomFieldLabelForDisplay(config, field.label),
        value: field.value,
      })),
    row.showDateTime
      ? { label: labels.dateTime, value: dateTimeText }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function signatureCompactNoteItem(
  row: BudgetSignatureRow,
  labels: SignatureMetaLabels,
  config: BudgetSignatureConfig,
): SignatureNoteItem {
  const role = row.showRole && row.roleLabel
    ? signatureRoleForDisplay(config, row.roleLabel)
    : '';
  const name = row.showName && row.displayName ? row.displayName : '';
  const details = [
    row.showPosition && row.position
      ? { label: labels.position, value: signaturePositionForDisplay(config, row.position) }
      : null,
    row.showEmail && row.email
      ? { label: labels.email, value: row.email }
      : null,
    ...(row.customFields ?? [])
      .filter((field) => field.show !== false && (field.label.trim() !== '' || field.value.trim() !== ''))
      .map((field) => ({
        label: signatureCustomFieldLabelForDisplay(config, field.label),
        value: field.value,
      })),
    row.showDateTime
      ? { label: labels.dateTime, value: row.signedAt ?? currentDateTimeText() }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (role && name) {
    return {
      id: row.id,
      primaryLabel: role,
      primaryValue: name,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  if (name) {
    return {
      id: row.id,
      primaryLabel: labels.name,
      primaryValue: name,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  if (role) {
    return {
      id: row.id,
      primaryLabel: '',
      primaryValue: role,
      details,
      hasDateTime: row.showDateTime,
    };
  }

  const [firstDetail, ...restDetails] = details;

  return {
    id: row.id,
    primaryLabel: firstDetail?.label ?? '',
    primaryValue: firstDetail?.value ?? '',
    details: restDetails,
    hasDateTime: row.showDateTime,
  };
}

function signatureNoteColumnCount(items: SignatureNoteItem[]): number {
  const maxColumns = Math.min(4, Math.max(1, items.length));
  const hasDateTime = items.some((item) => item.hasDateTime);
  if (hasDateTime) {
    return Math.min(maxColumns, 2);
  }

  const longestTextLength = Math.max(
    0,
    ...items.map((item) => [
      item.primaryLabel,
      item.primaryValue,
      ...item.details.flatMap((detail) => [detail.label, detail.value]),
    ].join(' ').length),
  );

  if (longestTextLength <= 28) {
    return maxColumns;
  }
  if (longestTextLength <= 48) {
    return Math.min(maxColumns, 3);
  }

  return Math.min(maxColumns, 2);
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
