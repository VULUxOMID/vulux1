import { spacetimeDb } from '../../lib/spacetime';

export type ReportTargetType = 'user' | 'message' | 'live';
export type ReportReviewStatus = 'open' | 'triaged' | 'resolved' | 'dismissed';

export type ReportRecord = {
  id: string;
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reportedUserId: string | null;
  surface: string;
  reason: string;
  details: string | null;
  context: Record<string, unknown>;
  status: ReportReviewStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAtIsoUtc: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      toMillis?: () => unknown;
      microsSinceUnixEpoch?: unknown;
      __timestamp_micros_since_unix_epoch__?: unknown;
    };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      if (typeof millis === 'number' && Number.isFinite(millis)) {
        return millis;
      }
    }

    const micros =
      candidate.microsSinceUnixEpoch ?? candidate.__timestamp_micros_since_unix_epoch__;
    if (typeof micros === 'number' && Number.isFinite(micros)) {
      return Math.floor(micros / 1000);
    }
  }

  return 0;
}

function makeClientReportId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getReducer(aliasNames: string[]): ((args: Record<string, unknown>) => Promise<unknown>) {
  const reducers = spacetimeDb.reducers as Record<string, unknown> | null | undefined;
  for (const alias of aliasNames) {
    const reducer = reducers?.[alias];
    if (typeof reducer === 'function') {
      return reducer as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }

  throw new Error(`SpacetimeDB reducer is unavailable: ${aliasNames[0]}`);
}

function normalizeReportRecord(row: Record<string, unknown>): ReportRecord | null {
  const id = normalizeString(row.id);
  const targetType = normalizeString(row.targetType) as ReportTargetType | null;
  const status = normalizeString(row.status) as ReportReviewStatus | null;
  if (!id || !targetType || !status) {
    return null;
  }

  return {
    id,
    reporterUserId: normalizeString(row.reporterUserId) ?? '',
    targetType,
    targetId: normalizeString(row.targetId) ?? '',
    reportedUserId: normalizeString(row.reportedUserId),
    surface: normalizeString(row.surface) ?? '',
    reason: normalizeString(row.reason) ?? '',
    details: normalizeString(row.details),
    context: parseJsonRecord(row.contextJson),
    status,
    reviewedBy: normalizeString(row.reviewedBy),
    reviewNotes: normalizeString(row.reviewNotes),
    reviewedAtIsoUtc: normalizeString(row.reviewedAtIsoUtc),
    createdAtMs: toTimestampMs(row.createdAt),
    updatedAtMs: toTimestampMs(row.updatedAt),
  };
}

function readRowsFromView(viewAliases: string[]): ReportRecord[] {
  const dbView = spacetimeDb.db as Record<string, unknown>;

  for (const alias of viewAliases) {
    const table = dbView[alias] as { iter?: () => Iterable<Record<string, unknown>> } | undefined;
    if (!table || typeof table.iter !== 'function') {
      continue;
    }

    return Array.from(table.iter())
      .map((row) => normalizeReportRecord(row))
      .filter((row): row is ReportRecord => Boolean(row));
  }

  return [];
}

export function readAdminReportQueue(): ReportRecord[] {
  return readRowsFromView(['adminReportQueue', 'admin_report_queue']).sort(
    (left, right) => right.updatedAtMs - left.updatedAtMs,
  );
}

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  surface: string;
  reason: string;
  details?: string | null;
  context?: Record<string, unknown>;
}): Promise<void> {
  const reducer = getReducer(['submitReport', 'submit_report']);
  await reducer({
    id: makeClientReportId('report'),
    targetType: input.targetType,
    targetId: input.targetId,
    surface: input.surface,
    reason: input.reason,
    details: normalizeString(input.details) ?? null,
    contextJson: JSON.stringify(input.context ?? {}),
  });
}

export async function reviewReport(input: {
  reportId: string;
  status: ReportReviewStatus;
  reviewNotes?: string | null;
}): Promise<void> {
  const reducer = getReducer(['reviewReport', 'review_report']);
  await reducer({
    reportId: input.reportId,
    status: input.status,
    reviewNotes: normalizeString(input.reviewNotes) ?? null,
  });
}
