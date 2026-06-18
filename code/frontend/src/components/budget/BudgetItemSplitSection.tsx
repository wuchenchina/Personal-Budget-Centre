import { Form, Input, InputNumber, Select } from 'antd';
import { useI18n } from '../../i18n';
import type {
  BudgetItemSplitType,
  BudgetParticipant,
  CurrencyCode,
} from '../../types/budget';
import { formatBudgetMoney } from '../../utils/budgetTemplate';

interface BudgetItemSplitSectionProps {
  baseCurrency: CurrencyCode;
  countedPerPersonParticipantCount: number;
  individualTotalBase: number;
  participantMode: 'solo' | 'group';
  participantOptions: Array<{ label: string; value: number }>;
  participants: BudgetParticipant[];
  perPersonAmountPreview: string;
  perPersonTotalBasePreview: number | null;
  selectedSplitType: BudgetItemSplitType;
  onPaidByChange: (participantId: number | null | undefined) => void;
  onSplitTypeChange: (splitType: BudgetItemSplitType) => void;
}

export function BudgetItemSplitSection({
  baseCurrency,
  countedPerPersonParticipantCount,
  individualTotalBase,
  participantMode,
  participantOptions,
  participants,
  perPersonAmountPreview,
  perPersonTotalBasePreview,
  selectedSplitType,
  onPaidByChange,
  onSplitTypeChange,
}: BudgetItemSplitSectionProps) {
  const { t } = useI18n();

  if (participantMode !== 'group' || participants.length === 0) {
    return null;
  }

  return (
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
            onChange={onPaidByChange}
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
            onChange={onSplitTypeChange}
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
  );
}
