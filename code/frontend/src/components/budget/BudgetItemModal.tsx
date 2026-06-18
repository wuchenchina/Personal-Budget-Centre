import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { ChangeEvent, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { RefreshCcw } from 'lucide-react';
import { currencyOptions } from '../../config/currencies';
import { useI18n } from '../../i18n';
import type {
  BudgetItem,
  BudgetItemSplitType,
  BudgetParticipant,
  CurrencyCode,
  Transaction,
} from '../../types/budget';
import type { BudgetItemFormValues } from '../../types/forms';
import type { BudgetItemModalFocus } from '../../hooks/useBudgetEntryController';
import {
  effectiveBudgetItemAmounts,
  formatBudgetMoney,
  transactionCurrencyTotalsForItem,
  type TransactionCurrencyTotal,
} from '../../utils/budgetTemplate';

interface BudgetItemModalProps {
  form: FormInstance<BudgetItemFormValues>;
  editingItem: BudgetItem | null;
  open: boolean;
  error: string | null;
  categoryOptions: Array<{ label: string; value: number }>;
  baseCurrency: CurrencyCode;
  focus: BudgetItemModalFocus;
  pricingEnabled: boolean;
  participantMode: 'solo' | 'group';
  participants: BudgetParticipant[];
  transactions: Transaction[];
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
  onRefreshRates: () => void;
}

export function BudgetItemModal({
  form,
  editingItem,
  open,
  error,
  categoryOptions,
  baseCurrency,
  focus,
  pricingEnabled,
  participantMode,
  participants,
  transactions,
  confirmLoading,
  onCancel,
  onOk,
  onRefreshRates,
}: BudgetItemModalProps) {
  const { t } = useI18n();
  const categoryRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDivElement>(null);
  const varianceRef = useRef<HTMLDivElement>(null);
  const budgetCurrency = Form.useWatch('budgetCurrency', form) ?? baseCurrency;
  const budgetAmount = Form.useWatch('budgetAmount', form);
  const budgetRate = Form.useWatch('budgetRate', form);
  const selectedCategoryId = Form.useWatch('categoryId', form);
  const pricingConfigEnabled = Form.useWatch(['pricingConfig', 'enabled'], form) === true;
  const pricingUnitPrice = Form.useWatch(['pricingConfig', 'unitPrice'], form);
  const pricingQuantity = Form.useWatch(['pricingConfig', 'quantity'], form);
  const selectedSplitType = Form.useWatch(['split', 'splitType'], form) ?? 'equal';
  const installmentEnabled = Form.useWatch(['installmentConfig', 'enabled'], form) === true;
  const installmentTotal = Form.useWatch(['installmentConfig', 'totalAmount'], form);
  const installmentMonths = Form.useWatch(['installmentConfig', 'months'], form);
  const installmentMonthly = Form.useWatch(['installmentConfig', 'monthlyAmount'], form);
  const installmentPaidMonths = Form.useWatch(['installmentConfig', 'paidMonths'], form);
  const calculatedMonthlyInstallment =
    typeof installmentMonthly === 'number' && installmentMonthly > 0
      ? installmentMonthly
      : null;
  const derivedMonthlyInstallment =
    calculatedMonthlyInstallment
    ?? (typeof installmentTotal === 'number'
      && typeof installmentMonths === 'number'
      && installmentTotal > 0
      && installmentMonths > 0
      ? installmentTotal / installmentMonths
      : null);
  const installmentRemainingMonths =
    typeof installmentMonths === 'number' && installmentMonths > 0
      ? Math.max(
        0,
        installmentMonths
          - (typeof installmentPaidMonths === 'number' && installmentPaidMonths > 0
            ? installmentPaidMonths
            : 0),
      )
      : null;
  const installmentPlannedTotal =
    typeof installmentTotal === 'number' && installmentTotal > 0
      ? installmentTotal
      : derivedMonthlyInstallment !== null && typeof installmentMonths === 'number' && installmentMonths > 0
        ? derivedMonthlyInstallment * installmentMonths
        : null;
  const transactionActuals = editingItem === null
    ? null
    : effectiveBudgetItemAmounts(editingItem, transactions);
  const transactionBaseAmountPerPerson = editingItem === null
    ? null
    : roundMoney(transactionCurrencyTotalsForItem(editingItem, transactions).reduce(
      (total, transaction) => total + transaction.amountBase,
      0,
    ));
  const focusLabel =
    focus === 'category'
      ? t('category')
      : focus === 'budget'
        ? t('budget')
        : focus === 'estimated_actuals'
          ? t('estimatedActuals')
          : focus === 'variance'
            ? t('variance')
            : null;
  const budgetBasePreview = previewBaseAmount(budgetAmount, budgetRate);
  const effectiveBudgetBasePreview = budgetBasePreview ?? transactionActuals?.budgetAmountBase ?? null;
  const individualAmounts = Form.useWatch(['split', 'individualAmounts'], form);
  const selectedSplitParticipantIds = Form.useWatch(['split', 'participantIds'], form);
  const perPersonParticipantCount = Array.isArray(selectedSplitParticipantIds)
    ? selectedSplitParticipantIds.length
    : participants.length;
  const countedPerPersonParticipantCount = Math.max(1, perPersonParticipantCount);
  const perPersonTotalBasePreview = budgetBasePreview === null
    ? transactionActuals?.budgetAmountBase ?? null
    : roundMoney(budgetBasePreview * countedPerPersonParticipantCount);
  const perPersonAmountBasePreview = budgetBasePreview
    ?? (transactionBaseAmountPerPerson === null
      ? null
      : transactionBaseAmountPerPerson);
  const perPersonAmountPreview = perPersonAmountBasePreview === null
    ? `${baseCurrency} --`
    : formatBudgetMoney(baseCurrency, perPersonAmountBasePreview);
  const settlementBudgetBasePreview = selectedSplitType === 'per_person'
    ? perPersonTotalBasePreview
    : effectiveBudgetBasePreview;
  const estimatedBasePreview = transactionActuals?.estimatedAmountBase ?? 0;
  const computedVariance =
    settlementBudgetBasePreview !== null
      ? roundMoney(settlementBudgetBasePreview - estimatedBasePreview)
      : transactionActuals?.varianceBase ?? null;
  const individualTotalBase = Array.isArray(individualAmounts)
    ? roundMoney(individualAmounts.reduce((total, item) => {
      const amount = typeof item?.amountBase === 'number' && Number.isFinite(item.amountBase)
        ? item.amountBase
        : 0;

      return total + Math.max(0, amount);
    }, 0))
    : 0;
  const participantOptions = participants.map((participant) => ({
    label: participant.name,
    value: participant.id,
  }));
  const pricingTotal =
    typeof pricingUnitPrice === 'number'
    && Number.isFinite(pricingUnitPrice)
    && pricingUnitPrice >= 0
    && typeof pricingQuantity === 'number'
    && Number.isFinite(pricingQuantity)
    && pricingQuantity >= 0
      ? roundMoney(pricingUnitPrice * pricingQuantity)
      : null;

  useEffect(() => {
    if (!open || focus === null) {
      return;
    }

    const target = focus === 'category'
      ? categoryRef.current
      : focus === 'variance'
        ? varianceRef.current
        : budgetRef.current;
    window.setTimeout(() => {
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }, [focus, open]);

  useEffect(() => {
    if (!open || selectedCategoryId === null || selectedCategoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === selectedCategoryId);
    if (selectedOption === undefined) {
      form.setFieldValue('categoryId', undefined);
    }
  }, [categoryOptions, form, open, selectedCategoryId]);

  useEffect(() => {
    if (!open || selectedSplitType !== 'personal') {
      return;
    }

    const paidByParticipantId = form.getFieldValue(['split', 'paidByParticipantId']);
    if (typeof paidByParticipantId === 'number') {
      form.setFieldValue(['split', 'participantIds'], [paidByParticipantId]);
    }
  }, [form, open, selectedSplitType]);

  useEffect(() => {
    if (!open || (selectedSplitType !== 'individual' && selectedSplitType !== 'per_person')) {
      return;
    }

    if (selectedSplitType === 'individual') {
      const currentRows = form.getFieldValue(['split', 'individualAmounts']) as IndividualAmountRows | undefined;
      const nextRows = normalizeIndividualAmountRows(currentRows, participants);
      if (!individualAmountRowsEqual(currentRows, nextRows)) {
        form.setFieldValue(['split', 'individualAmounts'], nextRows);
      }
    }
    if (form.getFieldValue(['split', 'paidByParticipantId']) !== null) {
      form.setFieldValue(['split', 'paidByParticipantId'], null);
    }
  }, [form, open, participants, selectedSplitType]);

  useEffect(() => {
    if (!open || !pricingEnabled || !pricingConfigEnabled || pricingTotal === null) {
      return;
    }

    const nextBudgetAmount = Number(pricingTotal.toFixed(2));
    if (form.getFieldValue('budgetAmount') !== nextBudgetAmount) {
      form.setFieldValue('budgetAmount', nextBudgetAmount);
    }
  }, [form, open, pricingConfigEnabled, pricingEnabled, pricingTotal]);

  const handleCategoryChange = (categoryId: number | null | undefined) => {
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined) {
      form.setFieldValue('label', selectedOption.label);
    }
  };
  const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
    const categoryId = form.getFieldValue('categoryId');
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const selectedOption = categoryOptions.find((option) => option.value === categoryId);
    if (selectedOption !== undefined && selectedOption.label !== event.target.value.trim()) {
      form.setFieldValue('categoryId', undefined);
    }
  };
  const handleSplitTypeChange = (splitType: BudgetItemSplitType) => {
    if (splitType !== 'per_person') {
      return;
    }

    const currentParticipantIds = form.getFieldValue(['split', 'participantIds']);
    if (!Array.isArray(currentParticipantIds) || currentParticipantIds.length <= 1) {
      form.setFieldValue(['split', 'participantIds'], participants.map((participant) => participant.id));
    }
  };
  const applyInstallmentMonthlyAmount = () => {
    if (derivedMonthlyInstallment === null) {
      return;
    }

    form.setFieldsValue({
      budgetAmount: Number(derivedMonthlyInstallment.toFixed(2)),
      installmentConfig: {
        ...form.getFieldValue('installmentConfig'),
        monthlyAmount: Number(derivedMonthlyInstallment.toFixed(2)),
        totalAmount:
          typeof installmentTotal === 'number' && installmentTotal > 0
            ? installmentTotal
            : installmentPlannedTotal === null
              ? null
              : Number(installmentPlannedTotal.toFixed(2)),
      },
    });
  };

  return (
    <Modal
      destroyOnClose
      confirmLoading={confirmLoading}
      okText={editingItem === null ? t('create') : t('save')}
      open={open}
      title={
        <>
          {editingItem === null ? t('budgetItem') : t('editBudgetItem')}
          {focusLabel === null ? null : <small className="modal-title-context">{focusLabel}</small>}
        </>
      }
      width="min(1040px, calc(100vw - 40px))"
      style={{ top: 18 }}
      wrapClassName="large-form-modal"
      onCancel={onCancel}
      onOk={onOk}
    >
      {error ? <Alert className="modal-error" type="error" showIcon message={error} /> : null}
      <Form<BudgetItemFormValues>
        form={form}
        layout="vertical"
        name="budget-centre-budget-item"
        requiredMark={false}
      >
        <div
          className={`entry-basic-grid${focus === 'category' ? ' budget-modal-focus-target' : ''}`}
          ref={categoryRef}
        >
          <Form.Item
            label={t('presetCategory')}
            name="categoryId"
            extra={t('presetCategoryHelp')}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
              placeholder={t('selectPresetCategory')}
              onChange={handleCategoryChange}
            />
          </Form.Item>

          <Form.Item
            label={t('categoryName')}
            name="label"
            rules={[
              { required: true, whitespace: true, message: t('categoryNameRequired') },
              { max: 160, message: t('categoryNameMax') },
            ]}
            extra={t('customCategoryHelp')}
          >
            <Input
              allowClear
              maxLength={160}
              placeholder={t('customCategoryPlaceholder')}
              onChange={handleLabelChange}
            />
          </Form.Item>
        </div>

        {pricingEnabled ? (
          <div className="pricing-config-panel installment-config-panel">
            <Form.Item name={['pricingConfig', 'enabled']} valuePropName="checked">
              <Checkbox>{t('enableUnitPricing')}</Checkbox>
            </Form.Item>
            {pricingConfigEnabled ? (
              <>
                <div className="installment-config-copy">
                  <strong>{t('unitPricingTitle')}</strong>
                  <span>{t('unitPricingHelp')}</span>
                </div>
                <div className="modal-form-grid">
                  <Form.Item
                    label={t('unitPrice')}
                    name={['pricingConfig', 'unitPrice']}
                    rules={[
                      { required: true, message: t('unitPriceRequired') },
                      { type: 'number', min: 0, message: t('unitPriceMin') },
                    ]}
                  >
                    <InputNumber
                      addonBefore={budgetCurrency ?? t('currency')}
                      className="form-full-width"
                      min={0}
                      precision={2}
                      step={100}
                    />
                  </Form.Item>
                  <Form.Item
                    label={t('quantity')}
                    name={['pricingConfig', 'quantity']}
                    rules={[
                      { required: true, message: t('quantityRequired') },
                      { type: 'number', min: 0, message: t('quantityMin') },
                    ]}
                  >
                    <InputNumber
                      className="form-full-width"
                      min={0}
                      precision={2}
                      step={1}
                    />
                  </Form.Item>
                </div>
                <div className="installment-config-summary">
                  <span>{t('totalPrice')}</span>
                  <strong>
                    {pricingTotal === null
                      ? `${budgetCurrency ?? t('currency')} --`
                      : `${budgetCurrency ?? t('currency')} ${pricingTotal.toFixed(2)}`}
                  </strong>
                  <span>{t('budgetAmount')}</span>
                  <strong>
                    {pricingTotal === null
                      ? '--'
                      : t('unitPricingSyncTarget')}
                  </strong>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {participantMode === 'group' && participants.length > 0 ? (
          <div className="group-split-panel">
            <div className="group-split-header">
              <div>
                <strong>{t('splitSettings')}</strong>
                <span>{t('splitSettingsHelp')}</span>
              </div>
            </div>
            <div className="modal-form-grid">
              <Form.Item
                label={t('paidBy')}
                name={['split', 'paidByParticipantId']}
                rules={[{ required: selectedSplitType === 'personal', message: t('selectPaidBy') }]}
                extra={
                  selectedSplitType === 'individual'
                    ? t('individualPaidByHelp')
                    : selectedSplitType === 'per_person'
                      ? t('perPersonPaidByHelp')
                      : undefined
                }
              >
                <Select
                  allowClear
                  disabled={selectedSplitType === 'individual' || selectedSplitType === 'per_person'}
                  optionFilterProp="label"
                  options={participantOptions}
                  placeholder={t('selectPaidBy')}
                  onChange={(participantId) => {
                    if (selectedSplitType === 'personal' && typeof participantId === 'number') {
                      form.setFieldValue(['split', 'participantIds'], [participantId]);
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                label={t('splitType')}
                name={['split', 'splitType']}
                rules={[{ required: true, message: t('selectSplitType') }]}
              >
                <Select
                  options={[
                    { label: t('splitEqual'), value: 'equal' },
                    { label: t('splitPersonal'), value: 'personal' },
                    { label: t('splitIndividual'), value: 'individual' },
                    { label: t('splitPerPerson'), value: 'per_person' },
                    { label: t('splitExcluded'), value: 'excluded' },
                  ] satisfies Array<{ label: string; value: BudgetItemSplitType }>}
                  onChange={handleSplitTypeChange}
                />
              </Form.Item>
            </div>
            {selectedSplitType === 'excluded'
              || selectedSplitType === 'personal'
              || selectedSplitType === 'individual' ? null : (
              <Form.Item
                label={t('splitParticipants')}
                name={['split', 'participantIds']}
                rules={[{ required: true, message: t('selectSplitParticipants') }]}
                extra={selectedSplitType === 'per_person' ? t('perPersonAmountHelp') : undefined}
              >
                <Select
                  mode="multiple"
                  optionFilterProp="label"
                  options={participantOptions}
                  placeholder={t('selectSplitParticipants')}
                />
              </Form.Item>
            )}
            {selectedSplitType === 'individual' ? (
              <Form.List name={['split', 'individualAmounts']}>
                {(_, __, { errors }) => (
                  <div className="individual-split-list">
                    <div className="individual-split-list-head">
                      <div>
                        <strong>{t('individualAmounts')}</strong>
                        <span>{t('individualAmountsHelp', { currency: baseCurrency })}</span>
                      </div>
                      <strong>{formatBudgetMoney(baseCurrency, individualTotalBase)}</strong>
                    </div>
                    {participants.map((participant, index) => (
                      <div className="individual-split-row" key={participant.id}>
                        <span>{participant.name}</span>
                        <Form.Item name={[index, 'participantId']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item
                          name={[index, 'amountBase']}
                          rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
                        >
                          <InputNumber
                            addonBefore={baseCurrency}
                            className="form-full-width"
                            min={0}
                            precision={2}
                            step={100}
                          />
                        </Form.Item>
                      </div>
                    ))}
                    <Form.ErrorList errors={errors} />
                  </div>
                )}
              </Form.List>
            ) : null}
            {selectedSplitType === 'per_person' ? (
              <div className="per-person-split-preview">
                <div>
                  <span>{t('perPersonTotalPreview')}</span>
                  <small>
                    {t('perPersonPreviewEquation', {
                      amount: perPersonAmountPreview,
                      count: countedPerPersonParticipantCount,
                    })}
                  </small>
                </div>
                <strong>
                  {perPersonTotalBasePreview === null
                    ? `${baseCurrency} --`
                    : formatBudgetMoney(baseCurrency, perPersonTotalBasePreview)}
                </strong>
              </div>
            ) : null}
            <Form.Item label={t('splitNote')} name={['split', 'note']}>
              <Input maxLength={500} />
            </Form.Item>
          </div>
        ) : null}

        <div className="currency-config-panel currency-config-panel-wide">
          <div className="currency-config-header">
            <div>
              <div className="currency-config-title">{t('amountCurrencySettings')}</div>
              <div className="currency-config-subtitle">
                {t('amountCurrencySettingsHelp', { currency: baseCurrency })}
              </div>
            </div>
            <Button
              icon={<RefreshCcw size={14} />}
              loading={confirmLoading}
              size="small"
              onClick={onRefreshRates}
            >
              {t('refreshBochkRates')}
            </Button>
          </div>
          <div className="currency-field-grid">
            <MoneyLegCard
              allowNegative
              amountName="budgetAmount"
              currencyName="budgetCurrency"
              rateName="budgetRate"
              amount={budgetAmount}
              baseCurrency={baseCurrency}
              currency={budgetCurrency}
              focused={focus === 'budget' || focus === 'variance'}
              help={t('budgetCurrencyLegHelp')}
              rate={budgetRate}
              title={t('budget')}
              wrapperRef={budgetRef}
            />
            <TransactionActualsCard
              baseCurrency={baseCurrency}
              totals={transactionActuals?.estimatedTransactionTotals ?? []}
              totalBase={estimatedBasePreview}
            />
            <SettlementPreviewCard
              baseCurrency={baseCurrency}
              budgetBase={settlementBudgetBasePreview}
              estimatedBase={estimatedBasePreview}
              focused={focus === 'variance'}
              varianceBase={computedVariance}
              wrapperRef={varianceRef}
            />
          </div>
        </div>

        <div className="installment-config-panel">
          <Form.Item name={['installmentConfig', 'enabled']} valuePropName="checked">
            <Checkbox>{t('enableInstallments')}</Checkbox>
          </Form.Item>
          {installmentEnabled ? (
            <>
              <div className="installment-config-copy">
                <strong>{t('installmentSavingsPlanTitle')}</strong>
                <span>{t('installmentSavingsPlanHelp')}</span>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentTotalAmount')}
                  name={['installmentConfig', 'totalAmount']}
                  rules={[{ type: 'number', min: 0, message: t('amountMin') }]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
                <Form.Item
                  label={t('installmentMonths')}
                  name={['installmentConfig', 'months']}
                  rules={[
                    { type: 'number', min: 1, message: t('installmentMonthsMin') },
                    { type: 'number', max: 600, message: t('installmentMonthsMax') },
                  ]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
                <Form.Item
                  label={t('installmentMonthlyAmount')}
                  name={['installmentConfig', 'monthlyAmount']}
                  extra={t('installmentMonthlyAmountHelp')}
                  rules={[
                    { type: 'number', min: Number.MIN_VALUE, message: t('installmentMonthlyMin') },
                  ]}
                >
                  <InputNumber
                    addonBefore={budgetCurrency ?? t('currency')}
                    className="form-full-width"
                    precision={2}
                    step={100}
                  />
                </Form.Item>
              </div>
              <div className="modal-form-grid">
                <Form.Item
                  label={t('installmentPaidMonths')}
                  name={['installmentConfig', 'paidMonths']}
                  rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
                >
                  <InputNumber className="form-full-width" precision={0} step={1} />
                </Form.Item>
                <Form.Item
                  label={t('installmentStartMonth')}
                  name={['installmentConfig', 'startMonth']}
                >
                  <DatePicker className="form-full-width" picker="month" />
                </Form.Item>
                <Form.Item label={t('installmentRemark')} name={['installmentConfig', 'remark']}>
                  <Input maxLength={500} placeholder={t('installmentRemarkPlaceholder')} />
                </Form.Item>
              </div>
              <div className="installment-config-summary">
                <span>{t('installmentPlannedTotal')}</span>
                <strong>
                  {installmentPlannedTotal === null
                    ? `${budgetCurrency ?? t('currency')} --`
                    : `${budgetCurrency ?? t('currency')} ${installmentPlannedTotal.toFixed(2)}`}
                </strong>
                <span>{t('installmentRemainingMonths')}</span>
                <strong>
                  {installmentRemainingMonths === null
                    ? '--'
                    : t('installmentRemaining', { count: installmentRemainingMonths })}
                </strong>
              </div>
              <Button
                block
                disabled={derivedMonthlyInstallment === null}
                type="dashed"
                onClick={applyInstallmentMonthlyAmount}
              >
                {derivedMonthlyInstallment === null
                  ? t('applyInstallmentMonthly')
                  : t('applyInstallmentMonthlyWithAmount', {
                    amount: `${budgetCurrency ?? t('currency')} ${derivedMonthlyInstallment.toFixed(2)}`,
                  })}
              </Button>
            </>
          ) : null}
        </div>

        <div className="modal-form-grid">
          <Form.Item
            label="Bank Fee (%)"
            name="bankFee"
            rules={[
              { type: 'number', min: 0, message: t('bankFeeMin') },
              { type: 'number', max: 100, message: t('bankFeeMax') },
            ]}
          >
            <InputNumber className="form-full-width" precision={2} step={0.1} />
          </Form.Item>
          <Form.Item
            label={t('sortOrder')}
            name="sortOrder"
            rules={[{ type: 'number', min: 0, message: t('sortOrderMin') }]}
          >
            <InputNumber className="form-full-width" precision={0} step={1} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

type IndividualAmountRows = NonNullable<BudgetItemFormValues['split']>['individualAmounts'];

function normalizeIndividualAmountRows(
  rows: IndividualAmountRows | undefined,
  participants: BudgetParticipant[],
): NonNullable<IndividualAmountRows> {
  const amountByParticipantId = new Map<number, number | null>();
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (typeof row?.participantId !== 'number') {
        return;
      }

      amountByParticipantId.set(
        row.participantId,
        typeof row.amountBase === 'number' && Number.isFinite(row.amountBase)
          ? row.amountBase
          : null,
      );
    });
  }

  return participants.map((participant) => ({
    participantId: participant.id,
    amountBase: amountByParticipantId.get(participant.id) ?? null,
  }));
}

function individualAmountRowsEqual(
  currentRows: IndividualAmountRows | undefined,
  nextRows: NonNullable<IndividualAmountRows>,
): boolean {
  if (!Array.isArray(currentRows) || currentRows.length !== nextRows.length) {
    return false;
  }

  return nextRows.every((nextRow, index) => {
    const currentRow = currentRows[index];

    return currentRow?.participantId === nextRow.participantId
      && (currentRow.amountBase ?? null) === (nextRow.amountBase ?? null);
  });
}

function MoneyLegCard({
  allowNegative = false,
  amount,
  amountName,
  baseCurrency,
  currency,
  currencyName,
  help,
  focused,
  rate,
  rateName,
  title,
  wrapperRef,
}: {
  allowNegative?: boolean;
  amount?: number;
  amountName: keyof BudgetItemFormValues;
  baseCurrency: CurrencyCode;
  currency: CurrencyCode;
  currencyName: keyof BudgetItemFormValues;
  focused: boolean;
  help: string;
  rate?: number;
  rateName: keyof BudgetItemFormValues;
  title: string;
  wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const preview = previewBaseAmount(amount, rate);

  return (
    <div
      className={`currency-field-card${focused ? ' budget-modal-focus-target' : ''}`}
      ref={wrapperRef}
    >
      <div className="currency-field-card-head">
        <strong>{title}</strong>
        <span>{help}</span>
      </div>
      <div className="currency-field-inner-grid">
        <Form.Item
          label={t('currency')}
          name={currencyName}
          rules={[{ required: true, message: t('selectCurrency') }]}
        >
          <Select options={currencyOptions} />
        </Form.Item>
        <Form.Item
          label={t('amount')}
          name={amountName}
          rules={
            allowNegative
              ? [{ type: 'number' }]
              : [{ type: 'number', min: 0, message: t('amountMin') }]
          }
        >
          <InputNumber
            addonBefore={currency}
            className="form-full-width"
            precision={2}
            step={100}
          />
        </Form.Item>
      </div>
      <Form.Item
        label={t('rateToBaseCurrency', { currency: baseCurrency })}
        name={rateName}
        extra={t('manualRateOptional')}
        rules={[{ type: 'number', min: Number.MIN_VALUE, message: t('rateMin') }]}
      >
        <InputNumber className="form-full-width" precision={6} step={0.01} />
      </Form.Item>
      <div className="currency-field-preview">
        <span>{t('baseCurrencyPreview')}</span>
        <strong>
          {preview === null ? `${baseCurrency} --` : `${baseCurrency} ${preview.toFixed(2)}`}
        </strong>
      </div>
    </div>
  );
}

function TransactionActualsCard({
  baseCurrency,
  totalBase,
  totals,
}: {
  baseCurrency: CurrencyCode;
  totalBase: number;
  totals: TransactionCurrencyTotal[];
}) {
  const { t } = useI18n();

  return (
    <div className="currency-field-card currency-field-card-muted">
      <div className="currency-field-card-head">
        <strong>{t('estimatedActuals')}</strong>
        <span>{t('transactionDrivenEstimatedActuals')}</span>
      </div>
      <div className="currency-readonly-amount">
        <span>{t('baseCurrencyPreview')}</span>
        <strong>{formatBudgetMoney(baseCurrency, totalBase)}</strong>
      </div>
      <div className="currency-readonly-breakdown">
        <span>{t('transactionCurrencyBreakdown')}</span>
        {totals.length === 0 ? (
          <strong>{t('noTransactionActuals')}</strong>
        ) : (
          <div>
            {totals.map((total) => (
              <small key={total.currency}>{formatBudgetMoney(total.currency, total.amountOriginal)}</small>
            ))}
          </div>
        )}
      </div>
      <p className="currency-readonly-help">{t('transactionDrivenEstimatedActualsHelp')}</p>
    </div>
  );
}

function SettlementPreviewCard({
  baseCurrency,
  budgetBase,
  estimatedBase,
  focused,
  varianceBase,
  wrapperRef,
}: {
  baseCurrency: CurrencyCode;
  budgetBase: number | null;
  estimatedBase: number;
  focused: boolean;
  varianceBase: number | null;
  wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();

  return (
    <div
      className={`currency-field-card currency-field-card-muted${focused ? ' budget-modal-focus-target' : ''}`}
      ref={wrapperRef}
    >
      <div className="currency-field-card-head">
        <strong>{t('variance')}</strong>
        <span>{baseCurrency}</span>
      </div>
      <div className="currency-readonly-ledger">
        <span>{t('budget')}</span>
        <strong>{budgetBase === null ? `${baseCurrency} --` : formatBudgetMoney(baseCurrency, budgetBase)}</strong>
        <span>{t('estimatedActuals')}</span>
        <strong>{formatBudgetMoney(baseCurrency, estimatedBase)}</strong>
      </div>
      <div className="currency-field-preview">
        <span>{t('settlementPreview')}</span>
        <strong>
          {varianceBase === null ? `${baseCurrency} --` : formatBudgetMoney(baseCurrency, varianceBase)}
        </strong>
      </div>
      <p className="currency-readonly-help">{t('varianceAutoHelp')}</p>
    </div>
  );
}

function previewBaseAmount(amount: number | null | undefined, rate: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return null;
  }

  const normalizedRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1;

  return roundMoney(amount * normalizedRate);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
