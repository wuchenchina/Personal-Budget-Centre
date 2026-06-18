import dayjs from 'dayjs';
import type { CreateBudgetPayload, UpdateBudgetPayload } from '../api/budgets';
import { currentLanguage, translateCurrent } from '../i18n';
import type { AuthSession } from '../types/auth';
import type { BudgetDetail, BudgetStatus, BudgetSummary, CurrencyCode } from '../types/budget';
import type { BudgetFormValues } from '../types/forms';
import {
  createSignatureRow,
  emptySignatureConfig,
  signatureConfigFromForm,
  signatureConfigToForm,
  signatureTitleForLanguage,
} from '../utils/budgetSignature';
import { defaultBudgetDateRange, defaultBudgetTitle } from '../utils/budgetTitle';
import {
  defaultParticipants,
  normalizedParticipants,
  participantsForBudgetForm,
} from './budgetControllerForm';

export function defaultBudgetFormValues(
  activeWorkspaceId: number | null,
  baseCurrency: CurrencyCode,
  session: AuthSession | null,
): Partial<BudgetFormValues> {
  const dateRange = defaultBudgetDateRange();
  const language = currentLanguage();
  const defaultSignatureRow = createSignatureRow('manual');

  return {
    workspaceId: activeWorkspaceId ?? undefined,
    title: defaultBudgetTitle(dateRange),
    ownerName: session?.user.displayName ?? '',
    dateRange,
    baseCurrency,
    displayCurrency: baseCurrency,
    budgetType: 'regular',
    participantMode: 'solo',
    participants: defaultParticipants(session),
    installmentDisplayMode: 'item',
    installmentPeriodUnit: 'month',
    pricingEnabled: false,
    visibility: 'private',
    status: 'draft',
    signatureConfig: {
      ...emptySignatureConfig(),
      title: signatureTitleForLanguage(language),
      infoLanguage: language,
      labelLanguage: language,
      labelSeparator: language === 'en' ? 'space' : 'none',
      rows: [
        {
          ...defaultSignatureRow,
          roleLabel: translateCurrent('defaultSignatureRole'),
          signedAt: null,
        },
      ],
    },
  };
}

export function budgetFormValuesFromSummary(
  budget: BudgetSummary,
  selectedBudget: BudgetDetail | null,
  session: AuthSession | null,
): Partial<BudgetFormValues> {
  return {
    workspaceId: budget.workspaceId,
    title: budget.title,
    ownerName: budget.ownerName,
    dateRange:
      budget.startDate && budget.endDate
        ? [dayjs(budget.startDate), dayjs(budget.endDate)]
        : null,
    baseCurrency: budget.baseCurrency,
    displayCurrency: budget.displayCurrency,
    budgetType: budget.budgetType,
    participantMode: budget.participantMode ?? 'solo',
    participants: participantsForBudgetForm(budget, selectedBudget, session),
    installmentDisplayMode: budget.installmentDisplayMode,
    installmentPeriodUnit: budget.installmentPeriodUnit,
    pricingEnabled: budget.pricingEnabled,
    visibility: budget.visibility,
    status: budget.status,
    note: budget.note ?? undefined,
    signatureConfig: signatureConfigToForm(budget.signatureConfig, currentLanguage()),
  };
}

export function createPayloadFromForm(values: BudgetFormValues): CreateBudgetPayload {
  return {
    workspaceId: values.workspaceId,
    title: values.title.trim(),
    ownerName: values.ownerName?.trim() ?? '',
    startDate: values.dateRange?.[0]?.format('YYYY-MM-DD') ?? null,
    endDate: values.dateRange?.[1]?.format('YYYY-MM-DD') ?? null,
    baseCurrency: values.baseCurrency,
    displayCurrency: values.displayCurrency,
    budgetType: values.budgetType ?? 'regular',
    participantMode: values.participantMode ?? 'solo',
    participants: normalizedParticipants(values.participants),
    installmentDisplayMode: values.installmentDisplayMode ?? 'item',
    installmentPeriodUnit: values.installmentPeriodUnit ?? 'month',
    pricingEnabled: values.pricingEnabled === true,
    visibility: values.visibility,
    status: values.status ?? 'draft',
    note: values.note?.trim() || null,
    signatureConfig: signatureConfigFromForm(values.signatureConfig),
  };
}

export function signaturePayloadFromForm(
  values: Pick<BudgetFormValues, 'signatureConfig'>,
): CreateBudgetPayload['signatureConfig'] {
  return signatureConfigFromForm(values.signatureConfig);
}

export function updatePayloadFromForm(
  id: number,
  values: BudgetFormValues,
): UpdateBudgetPayload {
  const payload = createPayloadFromForm(values);
  const { workspaceId, ...updatePayload } = payload;
  void workspaceId;

  return {
    ...updatePayload,
    id,
  };
}

export function updatePayloadFromBudget(
  budget: BudgetSummary,
  overrides: Partial<Omit<UpdateBudgetPayload, 'id'>> = {},
): UpdateBudgetPayload {
  return {
    id: budget.id,
    title: budget.title,
    ownerName: budget.ownerName,
    startDate: budget.startDate,
    endDate: budget.endDate,
    baseCurrency: budget.baseCurrency,
    displayCurrency: budget.displayCurrency,
    budgetType: budget.budgetType,
    participantMode: budget.participantMode,
    installmentDisplayMode: budget.installmentDisplayMode,
    installmentPeriodUnit: budget.installmentPeriodUnit,
    pricingEnabled: budget.pricingEnabled,
    visibility: budget.visibility,
    status: budget.status,
    note: budget.note,
    signatureConfig: budget.signatureConfig,
    ...overrides,
  };
}

export function statusUpdatePayload(
  budget: BudgetSummary,
  status: BudgetStatus,
): UpdateBudgetPayload {
  return updatePayloadFromBudget(budget, { status });
}
