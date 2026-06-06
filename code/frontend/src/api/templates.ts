import { apiGet } from './http';
import type { BudgetTemplateDefinition } from '../types/budget';

interface TemplateApiPayload {
  template: BudgetTemplateDefinition;
}

export function getPersonalBudgetTemplate(): Promise<BudgetTemplateDefinition> {
  return apiGet<TemplateApiPayload>('/api/templates/personal-living-budget').then(
    (payload) => payload.template,
  );
}
