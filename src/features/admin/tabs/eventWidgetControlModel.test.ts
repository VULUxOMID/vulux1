import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEventWidgetConfigSubmitPlan,
  toEventWidgetControlDraft,
  type EventWidgetConfigSnapshot,
} from './eventWidgetControlModel';

const BASE_CONFIG: EventWidgetConfigSnapshot = {
  enabled: true,
  entryAmountCash: 120,
  drawDurationMinutes: 15,
  drawIntervalMinutes: 10,
  autoplayEnabled: true,
  updatedBy: 'admin-user',
  updatedAtMs: 1_700_000_000_000,
};

test('toEventWidgetControlDraft maps snapshot values to editable string inputs', () => {
  const draft = toEventWidgetControlDraft(BASE_CONFIG);

  assert.deepEqual(draft, {
    enabled: true,
    entryAmountCashInput: '120',
    drawDurationMinutesInput: '15',
    drawIntervalMinutesInput: '10',
    autoplayEnabled: true,
  });
});

test('buildEventWidgetConfigSubmitPlan returns no-op when draft matches current config', () => {
  const draft = toEventWidgetControlDraft(BASE_CONFIG);
  const plan = buildEventWidgetConfigSubmitPlan(BASE_CONFIG, draft);

  assert.equal(plan.canSubmit, true);
  assert.equal(plan.hasChanges, false);
  assert.equal(plan.enabledChanged, false);
  assert.deepEqual(plan.configPatch, {});
  assert.deepEqual(plan.fieldErrors, {});
});

test('buildEventWidgetConfigSubmitPlan reports field errors for invalid integer input', () => {
  const plan = buildEventWidgetConfigSubmitPlan(BASE_CONFIG, {
    enabled: true,
    entryAmountCashInput: 'not-a-number',
    drawDurationMinutesInput: '15',
    drawIntervalMinutesInput: '10',
    autoplayEnabled: true,
  });

  assert.equal(plan.canSubmit, false);
  assert.equal(plan.hasChanges, false);
  assert.equal(plan.fieldErrors.entryAmountCash, 'Entry amount must be a whole number.');
});

test('buildEventWidgetConfigSubmitPlan enforces numeric bounds before submit', () => {
  const plan = buildEventWidgetConfigSubmitPlan(BASE_CONFIG, {
    enabled: true,
    entryAmountCashInput: '-1',
    drawDurationMinutesInput: '2000',
    drawIntervalMinutesInput: '0',
    autoplayEnabled: true,
  });

  assert.equal(plan.canSubmit, false);
  assert.equal(plan.hasChanges, false);
  assert.equal(
    plan.fieldErrors.entryAmountCash,
    'Entry amount must be between 0 and 1000000.',
  );
  assert.equal(
    plan.fieldErrors.drawDurationMinutes,
    'Timer limit must be between 1 and 1440.',
  );
  assert.equal(
    plan.fieldErrors.drawIntervalMinutes,
    'Autoplay frequency must be between 1 and 1440.',
  );
});

test('buildEventWidgetConfigSubmitPlan clamps draw interval to draw duration in patch', () => {
  const plan = buildEventWidgetConfigSubmitPlan(BASE_CONFIG, {
    enabled: true,
    entryAmountCashInput: '120',
    drawDurationMinutesInput: '7',
    drawIntervalMinutesInput: '12',
    autoplayEnabled: true,
  });

  assert.equal(plan.canSubmit, true);
  assert.equal(plan.hasChanges, true);
  assert.equal(plan.configPatch.drawDurationMinutes, 7);
  assert.equal(plan.configPatch.drawIntervalMinutes, 7);
});

test('buildEventWidgetConfigSubmitPlan includes enabled and autoplay state changes', () => {
  const plan = buildEventWidgetConfigSubmitPlan(BASE_CONFIG, {
    enabled: false,
    entryAmountCashInput: '250',
    drawDurationMinutesInput: '15',
    drawIntervalMinutesInput: '10',
    autoplayEnabled: false,
  });

  assert.equal(plan.canSubmit, true);
  assert.equal(plan.hasChanges, true);
  assert.equal(plan.enabledChanged, true);
  assert.equal(plan.nextEnabled, false);
  assert.equal(plan.configPatch.entryAmountCash, 250);
  assert.equal(plan.configPatch.autoplayEnabled, false);
});
