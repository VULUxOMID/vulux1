import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORT_DEDUPE_WINDOW_MS,
  REPORT_RATE_LIMIT_MAX,
  REPORT_RATE_LIMIT_WINDOW_MS,
  buildReportDedupeKey,
  evaluateReportSubmissionPolicy,
  normalizeReportStatus,
} from './reportingPolicy.ts';

test('report policy allows a fresh submission', () => {
  const decision = evaluateReportSubmissionPolicy({
    reporterUserId: 'user-1',
    dedupeKey: buildReportDedupeKey({
      reporterUserId: 'user-1',
      targetType: 'message',
      targetId: 'message-1',
      surface: 'global_chat',
      reason: 'Spam',
    }),
    nowMs: 10_000,
    existingReports: [],
  });

  assert.deepEqual(decision, { allowed: true });
});

test('report policy rejects a duplicate report within the dedupe window', () => {
  const dedupeKey = buildReportDedupeKey({
    reporterUserId: 'user-1',
    targetType: 'message',
    targetId: 'message-1',
    surface: 'global_chat',
    reason: 'Spam',
  });

  const decision = evaluateReportSubmissionPolicy({
    reporterUserId: 'user-1',
    dedupeKey,
    nowMs: REPORT_DEDUPE_WINDOW_MS - 1,
    existingReports: [
      {
        reporterUserId: 'user-1',
        dedupeKey,
        createdAtMs: 0,
      },
    ],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'duplicate');
});

test('report policy rejects report spam bursts from the same reporter', () => {
  const existingReports = Array.from({ length: REPORT_RATE_LIMIT_MAX }, (_, index) => ({
    reporterUserId: 'user-1',
    dedupeKey: `report-${index}`,
    createdAtMs: REPORT_RATE_LIMIT_WINDOW_MS - 1_000,
  }));

  const decision = evaluateReportSubmissionPolicy({
    reporterUserId: 'user-1',
    dedupeKey: 'report-new',
    nowMs: REPORT_RATE_LIMIT_WINDOW_MS,
    existingReports,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'rate_limited');
});

test('normalizeReportStatus accepts only known review states', () => {
  assert.equal(normalizeReportStatus('open'), 'open');
  assert.equal(normalizeReportStatus('TRIAGED'), 'triaged');
  assert.equal(normalizeReportStatus('resolved'), 'resolved');
  assert.equal(normalizeReportStatus('dismissed'), 'dismissed');
  assert.equal(normalizeReportStatus('unknown'), null);
});
