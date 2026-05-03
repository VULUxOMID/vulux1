import { readCurrentAuthAccessToken } from '../../auth/currentAuthAccessToken';
import { getConfiguredBackendBaseUrl } from '../../config/backendBaseUrl';

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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
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

function getReportsBaseUrl(): string {
  const baseUrl = getConfiguredBackendBaseUrl().trim();
  if (!baseUrl) {
    throw new Error('Backend API is not configured.');
  }
  return baseUrl.replace(/\/+$/, '');
}

async function readBackendToken(): Promise<string> {
  const token = normalizeString(await readCurrentAuthAccessToken());
  if (!token) {
    throw new Error('Missing auth token.');
  }
  return token;
}

async function parseJsonSafely(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function requestReports<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await readBackendToken();
  const response = await fetch(`${getReportsBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message
        : `Reports request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload ?? {}) as T;
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
    context: parseJsonRecord(row.context ?? row.contextJson),
    status,
    reviewedBy: normalizeString(row.reviewedBy),
    reviewNotes: normalizeString(row.reviewNotes),
    reviewedAtIsoUtc: normalizeString(row.reviewedAtIsoUtc ?? row.reviewedAt),
    createdAtMs: toTimestampMs(row.createdAtMs ?? row.createdAt),
    updatedAtMs: toTimestampMs(row.updatedAtMs ?? row.updatedAt),
  };
}

export async function listAdminReportQueue(): Promise<ReportRecord[]> {
  const payload = await requestReports<{ reports?: unknown }>('GET', '/api/reports');
  const rows = Array.isArray(payload.reports) ? payload.reports : [];
  return rows
    .map((row) => (row && typeof row === 'object' ? normalizeReportRecord(row as Record<string, unknown>) : null))
    .filter((row): row is ReportRecord => Boolean(row))
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs);
}

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  surface: string;
  reason: string;
  details?: string | null;
  context?: Record<string, unknown>;
  reportedUserId?: string | null;
}): Promise<void> {
  await requestReports('POST', '/api/reports', {
    targetType: input.targetType,
    targetId: input.targetId,
    surface: input.surface,
    reason: input.reason,
    details: normalizeString(input.details) ?? null,
    context: input.context ?? {},
    reportedUserId: normalizeString(input.reportedUserId) ?? null,
  });
}

export async function reviewReport(input: {
  reportId: string;
  status: ReportReviewStatus;
  reviewNotes?: string | null;
}): Promise<void> {
  await requestReports('POST', '/api/reports/review', {
    reportId: input.reportId,
    status: input.status,
    reviewNotes: normalizeString(input.reviewNotes) ?? null,
  });
}
