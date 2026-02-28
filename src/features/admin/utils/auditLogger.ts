import type { AdminAction, AdminAuditLogRecord } from '../types/index';
import { apiClient } from '../../../data/api';

type AuditLogQuery = {
  actionType?: string;
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  targetId?: string;
  page?: number;
  limit?: number;
};

type AuditLogListResponse = {
  ok?: boolean;
  logs?: AdminAuditLogRecord[];
  page?: number;
  limit?: number;
  hasMore?: boolean;
};

function shouldSkipAuditWrite(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.trim();
  return (
    message.includes('Backend API is not configured') ||
    message === 'Failed to fetch' ||
    message === 'Network request failed' ||
    message === 'Load failed' ||
    message === 'The network connection was lost.'
  );
}

function normalizeAuditLogRecord(record: AdminAuditLogRecord): AdminAuditLogRecord {
  return {
    ...record,
    adminUserId: record.actorAdminId || record.adminUserId,
    payload: record.metadata || record.payload || {},
    createdAt: record.ts || record.createdAt,
  };
}

class AuditLoggerService {
  log(action: AdminAction) {
    const requestBody = {
      actionType: action.actionType,
      targetType: action.targetType,
      targetId: action.targetId,
      reason: action.reason,
      metadata: action.payload ?? {},
      result: action.result,
      errorMessage: action.errorMessage,
    };

    if (__DEV__) {
      console.log('[AuditLog]', JSON.stringify(requestBody, null, 2));
    }

    void (async () => {
      try {
        await apiClient.post('/admin/audit_logs', requestBody);
      } catch (error) {
        if (shouldSkipAuditWrite(error)) {
          if (__DEV__) {
            console.log('[AuditLog] skipped because backend transport is unavailable');
          }
          return;
        }

        console.error('[AuditLog] Failed to write audit log:', error);
      }
    })();
  }

  async list(params?: AuditLogQuery) {
    const response = await apiClient.get<AuditLogListResponse>('/admin/audit_logs', params);
    return {
      logs: Array.isArray(response.logs) ? response.logs.map(normalizeAuditLogRecord) : [],
      page: typeof response.page === 'number' ? response.page : params?.page ?? 1,
      limit: typeof response.limit === 'number' ? response.limit : params?.limit ?? 20,
      hasMore: response.hasMore === true,
    };
  }
}

export const auditLogger = new AuditLoggerService();
