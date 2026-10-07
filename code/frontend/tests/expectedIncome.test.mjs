import assert from 'node:assert/strict';
import test from 'node:test';
import { annualSalaryAmount, expectedMonthlyIncome, incomePeriodMonths } from '../src/utils/expectedIncome.ts';

test('annual total and 12/13/16 salary payments', () => {
  assert.equal(annualSalaryAmount({ mode: 'total', amount: 160000, paymentsPerYear: 12 }), 160000);
  for (const paymentsPerYear of [12, 13, 16]) {
    assert.equal(annualSalaryAmount({ mode: 'monthly', amount: 10000, paymentsPerYear }), 10000 * paymentsPerYear);
  }
  assert.equal(annualSalaryAmount(null), 0);
});

test('annual priority, manual monthly/daily override, automatic fallback', () => {
  const income = { mode: 'auto', monthlyAmount: 9000, dailyAmount: 500, workdays: 26, annualAmount: 156000 };
  assert.equal(expectedMonthlyIncome(income), 13000);
  assert.equal(expectedMonthlyIncome({ ...income, mode: 'monthly' }), 9000);
  assert.equal(expectedMonthlyIncome({ ...income, mode: 'daily' }), 13000);
  assert.equal(expectedMonthlyIncome({ ...income, annualAmount: undefined }), 9000);
  assert.equal(expectedMonthlyIncome(null), 0);
});

test('inclusive calendar periods handle leap years and partial months', () => {
  assert.equal(incomePeriodMonths('2024-01-01', '2024-12-31'), 12);
  assert.equal(incomePeriodMonths('2024-02-01', '2024-02-29'), 1);
  assert.equal(incomePeriodMonths('2024-02-15', '2024-02-15'), 1 / 29);
  assert.equal(incomePeriodMonths('2024-01-31', '2024-02-01'), 1 / 31 + 1 / 29);
  assert.equal(incomePeriodMonths(null, null), 1);
  assert.equal(incomePeriodMonths('2024-02-02', '2024-02-01'), 0);
});

test('multiple jobs, one-off income, funding surplus and shortfall', async () => {
  const { incomeSummary } = await import('../src/utils/expectedIncome.ts');
  const base = { monthlyAmount: 0, dailyAmount: 0, workdays: 26, oneOffAmount: 0 };
  const budget = {
    startDate: '2024-01-01', endDate: '2024-02-29', totals: { totalBudgetBase: 50000 },
    expectedIncome: { entries: [
      { ...base, id: 'job', title: 'Job', mode: 'annual', annualAmount: 120000 },
      { ...base, id: 'side', title: 'Side job', mode: 'daily', dailyAmount: 500 },
      { ...base, id: 'gift', title: 'Gift', mode: 'one_off', oneOffAmount: 5000 },
    ] },
  };
  assert.deepEqual(incomeSummary(budget), { monthly: 23000, oneOff: 5000, total: 51000, expenses: 50000, balance: 1000 });
  assert.equal(incomeSummary({ ...budget, totals: { totalBudgetBase: 60000 } }).balance, -9000);
  assert.equal(incomeSummary({ ...budget, startDate: null, endDate: null }).total, 28000);
  assert.equal(incomeSummary({ ...budget, expectedIncome: { entries: [] } }).total, 0);
});
