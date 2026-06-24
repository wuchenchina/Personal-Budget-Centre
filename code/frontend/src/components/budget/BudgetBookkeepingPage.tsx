import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, FloatButton, Input, Popconfirm, Space, Spin, Table, Tabs, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import { ArrowLeft, Download, FileText, Landmark, Pencil, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { transactionTypeColors } from '../../config/appConfig';
import { languageOptions, useI18n } from '../../i18n';
import type { PdfExportSettings } from '../../types/auth';
import type {
  BookkeepingRecord,
  BudgetDetail,
  BudgetExportOptions,
  BudgetSignatureLabelMode,
  CurrencyCode,
  PdfThemeKey,
  TransactionType,
} from '../../types/budget';
import { formatMoney } from '../../utils/currency';
import {
  BudgetPdfExportSettingsModal,
} from './BudgetPdfExportSettingsModal';
import { budgetPdfExportSettingsValue } from '../../utils/budgetPdfExportSettingsValue';
import { BudgetExchangeRateManager } from './BudgetExchangeRateManager';
import type { CurrencySelectOption } from '../../utils/currencyOptions';

interface BudgetBookkeepingPageProps {
  selectedBudget: BudgetDetail | null;
  baseCurrency: CurrencyCode;
  canWriteBudgets: boolean;
  loading: boolean;
  error: string | null;
  records: BookkeepingRecord[];
  saving: boolean;
  deletingRecordId: number | null;
  defaultPdfTheme: PdfThemeKey;
  exportingPdf: boolean;
  pdfExportSettings: PdfExportSettings;
  currencyOptions: CurrencySelectOption[];
  onBackToProjects: () => void;
  onOpenEditor: (budgetId: number) => void;
  onExportPdf: (options: BudgetExportOptions) => void;
  onNewRecord: () => void;
  onEditRecord: (record: BookkeepingRecord) => void;
  onDeleteRecord: (recordId: number) => void;
}

type LedgerFilter = 'all' | 'orders' | 'transfers';

export function BudgetBookkeepingPage({
  selectedBudget,
  baseCurrency,
  canWriteBudgets,
  loading,
  error,
  records,
  saving,
  deletingRecordId,
  defaultPdfTheme,
  exportingPdf,
  pdfExportSettings,
  currencyOptions,
  onBackToProjects,
  onOpenEditor,
  onExportPdf,
  onNewRecord,
  onEditRecord,
  onDeleteRecord,
}: BudgetBookkeepingPageProps) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<LedgerFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState(() =>
    budgetPdfExportSettingsValue(defaultPdfTheme, pdfExportSettings),
  );
  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        setExportSettings(budgetPdfExportSettingsValue(defaultPdfTheme, pdfExportSettings));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [defaultPdfTheme, pdfExportSettings]);
  useEffect(() => {
    if (!exportingPdf) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [exportingPdf]);
  const currency = selectedBudget?.baseCurrency ?? baseCurrency;
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRecords = useMemo(
    () => records
      .filter((record) => {
        const matchesFilter =
          activeFilter === 'all'
          || (activeFilter === 'orders' && isOrderTransaction(record.transactionType))
          || (activeFilter === 'transfers' && isTransferTransaction(record.transactionType));
        const matchesSearch =
          normalizedSearch.length === 0
          || record.details.toLowerCase().includes(normalizedSearch)
          || (record.orderReference ?? '').toLowerCase().includes(normalizedSearch)
          || (record.categoryLabel ?? '').toLowerCase().includes(normalizedSearch)
          || (record.sourceAccountName ?? '').toLowerCase().includes(normalizedSearch)
          || (record.destinationAccountName ?? '').toLowerCase().includes(normalizedSearch)
          || (record.remark ?? '').toLowerCase().includes(normalizedSearch);

        return matchesFilter && matchesSearch;
      })
      .sort(compareByRecordDate),
    [activeFilter, normalizedSearch, records],
  );
  const totals = useMemo(() => ledgerTotals(records, currency), [currency, records]);
  const visibleOrderTotals = useMemo(
    () => orderTransactionTotals(filteredRecords, currency),
    [currency, filteredRecords],
  );
  const columns = useMemo<TableProps<BookkeepingRecord>['columns']>(() => [
    {
      key: 'type',
      title: t('transactionType'),
      width: 104,
      render: (_value, row) => (
        <Tag color={transactionTypeColors[row.transactionType]}>
          {transactionTypeLabel(row.transactionType, t)}
        </Tag>
      ),
    },
    {
      key: 'date',
      title: t('date'),
      dataIndex: 'recordDate',
      width: 106,
      render: (value: BookkeepingRecord['recordDate']) => value ?? '-',
    },
    {
      key: 'order',
      title: t('orderReference'),
      dataIndex: 'orderReference',
      width: 170,
      render: (value: BookkeepingRecord['orderReference']) => (
        <span className="bookkeeping-order-cell">{value ?? '-'}</span>
      ),
    },
    {
      key: 'details',
      title: t('transactionDetails'),
      dataIndex: 'details',
      minWidth: 220,
      render: (_value, row) => (
        <div className="bookkeeping-detail-cell">
          <strong>{row.details}</strong>
        </div>
      ),
    },
    {
      key: 'category',
      title: t('category'),
      dataIndex: 'categoryLabel',
      width: 140,
      render: (value: BookkeepingRecord['categoryLabel']) => (
        <span className="bookkeeping-category-cell">{value ?? '-'}</span>
      ),
    },
    {
      key: 'accounts',
      title: t('fundsAccounts'),
      width: 128,
      render: (_value, row) => (
        <span className="bookkeeping-account-cell">{accountRouteText(row) ?? '-'}</span>
      ),
    },
    {
      key: 'amount',
      title: t('amount'),
      align: 'right',
      width: 138,
      render: (_value, row) => (
        <div className="bookkeeping-money-cell">
          <strong>{formatMoney({ currency: row.currency, amount: row.amountOriginal })}</strong>
          {row.currency !== currency ? (
            <span>{formatMoney({ currency, amount: row.amountBase })}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'destination',
      title: t('destinationAmount'),
      align: 'right',
      width: 138,
      render: (_value, row) => (
        row.destinationCurrency && row.destinationAmountOriginal !== null
          ? formatMoney({
            currency: row.destinationCurrency,
            amount: row.destinationAmountOriginal,
          })
          : '-'
      ),
    },
    {
      key: 'remark',
      title: t('note'),
      dataIndex: 'remark',
      minWidth: 120,
      render: (value: BookkeepingRecord['remark']) => value ?? '-',
    },
    {
      key: 'actions',
      title: '',
      align: 'center',
      width: 70,
      render: (_value, row) => (
        canWriteBudgets ? (
          <Space size={2}>
            <Tooltip title={t('edit')}>
              <Button
                icon={<Pencil size={14} />}
                size="small"
                type="text"
                onClick={() => onEditRecord(row)}
              />
            </Tooltip>
            <Popconfirm
              title={t('deleteBookkeepingRecordTitle')}
              okText={t('delete')}
              cancelText={t('cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteRecord(row.id)}
            >
              <Tooltip title={t('delete')}>
                <Button
                  danger
                  icon={<Trash2 size={14} />}
                  loading={deletingRecordId === row.id}
                  size="small"
                  type="text"
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ) : null
      ),
    },
  ], [
    canWriteBudgets,
    currency,
    deletingRecordId,
    onDeleteRecord,
    onEditRecord,
    t,
  ]);

  return (
    <div className="bookkeeping-page">
      <Spin
        className="pdf-export-spin"
        fullscreen
        spinning={exportingPdf}
        tip={t('pdfExportGenerating')}
      />
      <section className="project-page-header bookkeeping-header">
        <div>
          <Tag color="red">{t('bookkeeping')}</Tag>
          <h1>{selectedBudget?.title ?? t('bookkeeping')}</h1>
          <p>{t('bookkeepingPageDesc')}</p>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeft size={15} />} onClick={onBackToProjects}>
            {t('projectLibrary')}
          </Button>
          {selectedBudget ? (
            <Button onClick={() => onOpenEditor(selectedBudget.id)}>
              {t('newTabEdit')}
            </Button>
          ) : null}
          <BudgetExchangeRateManager
            budgetId={selectedBudget?.id ?? null}
            baseCurrency={currency}
            canWriteBudgets={canWriteBudgets}
            currencyOptions={currencyOptions}
          />
          {canWriteBudgets ? (
            <Button type="primary" icon={<Plus size={16} />} onClick={onNewRecord}>
              {t('addBookkeepingRecord')}
            </Button>
          ) : null}
        </Space>
      </section>

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <div className="budget-export-strip">
        <div className="budget-export-actions">
          <span className="budget-export-label">
            <FileText size={15} />
            {t('export')}
          </span>
          <Button
            disabled={selectedBudget === null || exportingPdf}
            icon={<Settings2 size={13} />}
            size="small"
            onClick={() => setIsExportSettingsOpen(true)}
          >
            {t('pdfExportSettings')}
          </Button>
          <Button
            disabled={selectedBudget === null || exportingPdf}
            icon={<Download size={13} />}
            loading={exportingPdf}
            size="small"
            onClick={() => onExportPdf({
              pdfLanguages: exportSettings.pdfLanguages,
              pdfTheme: exportSettings.pdfTheme,
              showWorkspace: exportSettings.showWorkspace,
              signatureLabelLanguages: exportSettings.signatureLabelLanguages,
              signatureLabelMode: exportSettings.signatureLabelMode,
            })}
          >
            {t('exportPdf')}
          </Button>
        </div>
        <div className="budget-export-meta">
          {exportSettings.pdfLanguages.map((pdfLanguage) => (
            <Tag key={pdfLanguage}>
              {languageOptions.find((option) => option.value === pdfLanguage)?.label ?? pdfLanguage}
            </Tag>
          ))}
          <Tag color="geekblue">{t(signatureLabelModeKey(exportSettings.signatureLabelMode))}</Tag>
          {exportSettings.signatureLabelLanguages.map((signatureLanguage) => (
            <Tag key={`signature-${signatureLanguage}`} color="cyan">
              {languageOptions.find((option) => option.value === signatureLanguage)?.label ?? signatureLanguage}
            </Tag>
          ))}
        </div>
      </div>
      <BudgetPdfExportSettingsModal
        open={isExportSettingsOpen && !exportingPdf}
        value={exportSettings}
        onApply={(nextSettings) => {
          setExportSettings(nextSettings);
          setIsExportSettingsOpen(false);
        }}
        onCancel={() => setIsExportSettingsOpen(false)}
      />

      <section className="project-overview-grid bookkeeping-overview-grid">
        <BookkeepingTile label={t('ledgerRecords')} value={records.length.toLocaleString('en-US')} />
        <BookkeepingTile label={t('transferRecords')} value={totals.transferCount.toLocaleString('en-US')} />
        <BookkeepingTile
          label={t('ledgerAmountBase')}
          value={formatMoney({ currency, amount: totals.baseAmount })}
        />
      </section>

      <section className="project-panel bookkeeping-ledger-panel">
        <div className="bookkeeping-toolbar">
          <Tabs
            activeKey={activeFilter}
            items={[
              { key: 'all', label: t('all') },
              { key: 'orders', label: t('orderRecords') },
              { key: 'transfers', label: t('transferRecords') },
            ]}
            onChange={(key) => setActiveFilter(key as LedgerFilter)}
          />
          <Input
            allowClear
            className="bookkeeping-search"
            placeholder={t('searchBookkeeping')}
            prefix={<Search size={15} />}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Table<BookkeepingRecord>
          bordered
          className="bookkeeping-ledger-table"
          columns={columns}
          dataSource={filteredRecords}
          loading={loading || saving}
          locale={{ emptyText: <Empty image={<Landmark size={34} />} description={t('bookkeepingRecordsEmpty')} /> }}
          pagination={{
            defaultPageSize: 12,
            pageSizeOptions: [12, 20, 50, 100],
            showSizeChanger: true,
          }}
          rowKey="id"
          scroll={{ x: 1314 }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row className="bookkeeping-total-row">
                <Table.Summary.Cell index={0} colSpan={6}>
                  {t('bookkeepingIncomeTotal')}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <strong>{formatMoney({ currency, amount: visibleOrderTotals.income })}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
                <Table.Summary.Cell index={8} />
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>
              <Table.Summary.Row className="bookkeeping-total-row">
                <Table.Summary.Cell index={0} colSpan={6}>
                  {t('bookkeepingExpenseTotal')}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <strong>{formatMoney({ currency, amount: visibleOrderTotals.expense })}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
                <Table.Summary.Cell index={8} />
                <Table.Summary.Cell index={9} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </section>
      {canWriteBudgets ? (
        <FloatButton
          className="bookkeeping-add-float"
          icon={<Plus size={20} />}
          tooltip={t('addBookkeepingRecord')}
          type="primary"
          onClick={onNewRecord}
        />
      ) : null}
    </div>
  );
}

function BookkeepingTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ledgerTotals(records: BookkeepingRecord[], currency: CurrencyCode) {
  return records.reduce(
    (totals, record) => ({
      baseAmount: totals.baseAmount + (record.currency === currency
        ? record.amountOriginal
        : record.amountBase),
      transferCount: totals.transferCount + (isTransferTransaction(record.transactionType) ? 1 : 0),
    }),
    { baseAmount: 0, transferCount: 0 },
  );
}

function orderTransactionTotals(
  records: BookkeepingRecord[],
  currency: CurrencyCode,
): { income: number; expense: number } {
  return records.reduce((totals, record) => {
    if (!isOrderTransaction(record.transactionType)) {
      return totals;
    }

    const amount = record.currency === currency ? record.amountOriginal : record.amountBase;
    if (record.transactionType === 'income') {
      return { ...totals, income: totals.income + amount };
    }

    return { ...totals, expense: totals.expense + amount };
  }, { income: 0, expense: 0 });
}

function compareByRecordDate(left: BookkeepingRecord, right: BookkeepingRecord): number {
  // 優先依記帳日期排序;沒有日期的記錄沉到最後。
  // 同日期時退回手動 sortOrder,再以 id 確保排序穩定。
  if (left.recordDate !== right.recordDate) {
    if (left.recordDate === null) {
      return 1;
    }

    if (right.recordDate === null) {
      return -1;
    }

    return left.recordDate.localeCompare(right.recordDate);
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.id - right.id;
}

function isOrderTransaction(type: TransactionType): boolean {
  return type === 'expense' || type === 'income';
}

function isTransferTransaction(type: TransactionType): boolean {
  return type === 'transfer' || type === 'fx_exchange' || type === 'cross_border_remittance';
}

function signatureLabelModeKey(mode: BudgetSignatureLabelMode) {
  switch (mode) {
    case 'confirmation':
      return 'confirmationOnly';
    case 'signature':
      return 'signatureOnly';
    default:
      return 'confirmationSignature';
  }
}

function accountRouteText(record: BookkeepingRecord): string | null {
  const source = record.sourceAccountName;
  const destination = record.destinationAccountName;
  if (source && destination) {
    return `${source} -> ${destination}`;
  }

  return source ?? destination ?? null;
}

function transactionTypeLabel(
  type: TransactionType,
  t: (key: 'transactionTypeExpense'
    | 'transactionTypeIncome'
    | 'transactionTypeSof'
    | 'transactionTypeTransfer'
    | 'transactionTypeFxExchange'
    | 'transactionTypeCrossBorderRemittance') => string,
): string {
  switch (type) {
    case 'income':
      return t('transactionTypeIncome');
    case 'sof':
      return t('transactionTypeSof');
    case 'transfer':
      return t('transactionTypeTransfer');
    case 'fx_exchange':
      return t('transactionTypeFxExchange');
    case 'cross_border_remittance':
      return t('transactionTypeCrossBorderRemittance');
    case 'expense':
    default:
      return t('transactionTypeExpense');
  }
}
