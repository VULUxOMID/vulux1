import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countDistinctActivePlayersNow,
  resolveEventWidgetRuntimeConfig,
} from './eventRuntimeConfig';

test('resolveEventWidgetRuntimeConfig reads backend runtime config fields', () => {
  const runtime = resolveEventWidgetRuntimeConfig({
    eventWidgetRuntime: {
      enabled: false,
      entryAmount: 42,
      drawDurationMinutes: 9,
      drawIntervalMinutes: 7,
      autoplayFrequencySeconds: 12,
    },
  });

  assert.equal(runtime.enabled, false);
  assert.equal(runtime.entryAmount, 42);
  assert.equal(runtime.drawDurationMinutes, 9);
  assert.equal(runtime.drawIntervalMinutes, 7);
  assert.equal(runtime.autoplayFrequencySeconds, 12);
});

test('resolveEventWidgetRuntimeConfig supports compatibility aliases', () => {
  const runtime = resolveEventWidgetRuntimeConfig({
    eventWidgetConfig: {
      isEnabled: true,
      entryCost: '25',
      timerMinutes: '11',
      intervalMinutes: 5,
      autoplayFrequencyMinutes: 2,
    },
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.entryAmount, 25);
  assert.equal(runtime.drawDurationMinutes, 11);
  assert.equal(runtime.drawIntervalMinutes, 5);
  assert.equal(runtime.autoplayFrequencySeconds, 120);
});

test('countDistinctActivePlayersNow counts distinct fresh hosting/watching users', () => {
  const nowMs = 1_700_000_000_000;
  const count = countDistinctActivePlayersNow(
    [
      { userId: 'host-1', activity: 'hosting', liveId: 'live-1', updatedAt: nowMs - 1_000 },
      { userId: 'viewer-1', activity: 'watching', liveId: 'live-1', updatedAt: nowMs - 2_000 },
      { userId: 'viewer-1', activity: 'watching', liveId: 'live-2', updatedAt: nowMs - 500 },
      { userId: 'stale-1', activity: 'watching', liveId: 'live-1', updatedAt: nowMs - 40_000 },
    ],
    { nowMs, freshnessWindowMs: 30_000 },
  );

  assert.equal(count, 2);
});
