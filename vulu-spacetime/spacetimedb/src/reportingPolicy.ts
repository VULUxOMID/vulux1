export const REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const REPORT_RATE_LIMIT_MAX = 5;
export const REPORT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const REPORT_STATUSES = ['open', 'triaged', 'resolved', 'dismissed'] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type ExistingReportPolicyRecord = {
  reporterUserId: string;
  dedupeKey: string;
  createdAtMs: number;
};

export type ReportPolicyDecision =
  | { allowed: true }
  | { allowed: false; code: 'duplicate' | 'rate_limited'; message: string };

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildReportDedupeKey(input: {
  reporterUserId: string;
  targetType: string;
  targetId: string;
  surface: string;
  reason: string;
}): string {
  return [
    normalizeString(input.reporterUserId).toLowerCase(),
    normalizeString(input.targetType).toLowerCase(),
    normalizeString(input.targetId).toLowerCase(),
    normalizeString(input.surface).toLowerCase(),
    normalizeString(input.reason).toLowerCase(),
  ].join('::');
}

export function normalizeReportStatus(value: unknown): ReportStatus | null {
  const normalized = normalizeString(value).toLowerCase();
  return (REPORT_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as ReportStatus)
    : null;
}

export function evaluateReportSubmissionPolicy(input: {
  reporterUserId: string;
  dedupeKey: string;
  nowMs: number;
  existingReports: ExistingReportPolicyRecord[];
}): ReportPolicyDecision {
  const reporterUserId = normalizeString(input.reporterUserId);
  const dedupeKey = normalizeString(input.dedupeKey);

  if (!reporterUserId || !dedupeKey) {
    return {
      allowed: false,
      code: 'rate_limited',
      message: 'A valid report identity is required.',
    };
  }

  let recentCount = 0;
  for (const row of input.existingReports) {
    if (normalizeString(row.reporterUserId) !== reporterUserId) {
      continue;
    }

    const ageMs = input.nowMs - row.createdAtMs;
    if (ageMs <= REPORT_RATE_LIMIT_WINDOW_MS) {
      recentCount += 1;
    }

    if (normalizeString(row.dedupeKey) === dedupeKey && ageMs <= REPORT_DEDUPE_WINDOW_MS) {
      return {
        allowed: false,
        code: 'duplicate',
        message: 'You already submitted a similar report recently.',
      };
    }
  }

  if (recentCount >= REPORT_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      code: 'rate_limited',
      message: 'Too many reports were submitted recently. Please try again later.',
    };
  }

  return { allowed: true };
}
