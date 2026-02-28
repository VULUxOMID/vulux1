export const SUPPORT_TICKET_STATUSES = [
  'open',
  'investigating',
  'resolved',
  'closed',
] as const;

export const SUPPORT_TICKET_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export type TicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type TicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export type SupportTicketNote = {
  id: string;
  body: string;
  adminId: string | null;
  createdAt: string;
};

export type SupportTicketStatusHistoryEntry = {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  reason: string;
  adminId: string | null;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  createdAt: string;
  userId: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeAdminId: string | null;
  notes: SupportTicketNote[];
  statusHistory: SupportTicketStatusHistoryEntry[];
  updatedAt: string;
};

export type SupportTicketFilters = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeAdminId?: string;
};

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function asNullableText(value: unknown): string | null {
  const nextValue = asText(value).trim();
  return nextValue ? nextValue : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeIsoDate(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const nextDate = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(nextDate.getTime()) ? fallback : nextDate.toISOString();
  }

  const rawValue = asText(value).trim();
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Date.parse(rawValue);
  if (Number.isFinite(parsedValue)) {
    return new Date(parsedValue).toISOString();
  }

  if (/^\d+$/.test(rawValue)) {
    const numericValue = Number.parseInt(rawValue, 10);
    if (Number.isFinite(numericValue)) {
      const nextDate = new Date(rawValue.length >= 13 ? numericValue : numericValue * 1000);
      return Number.isNaN(nextDate.getTime()) ? fallback : nextDate.toISOString();
    }
  }

  return fallback;
}

export function normalizeTicketStatus(
  value: unknown,
  fallback: TicketStatus | null = 'open',
): TicketStatus | null {
  const normalizedValue = asText(value).trim().toLowerCase();
  if ((SUPPORT_TICKET_STATUSES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as TicketStatus;
  }
  return fallback;
}

export function normalizeTicketPriority(
  value: unknown,
  fallback: TicketPriority | null = 'normal',
): TicketPriority | null {
  const normalizedValue = asText(value).trim().toLowerCase();
  if ((SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as TicketPriority;
  }
  return fallback;
}

function normalizeSupportTicketNote(value: unknown, index: number): SupportTicketNote {
  const note = asRecord(value);
  const fallbackCreatedAt = new Date(0).toISOString();

  return {
    id: asText(note.id) || `note-${index + 1}`,
    body: asText(note.body) || asText(note.text),
    adminId: asNullableText(note.adminId),
    createdAt: normalizeIsoDate(
      note.createdAt ?? note.created_at ?? note.timestamp,
      fallbackCreatedAt,
    ),
  };
}

function normalizeSupportTicketHistoryEntry(
  value: unknown,
  index: number,
  fallbackStatus: TicketStatus,
): SupportTicketStatusHistoryEntry {
  const entry = asRecord(value);
  const fallbackCreatedAt = new Date(0).toISOString();

  return {
    id: asText(entry.id) || `history-${index + 1}`,
    fromStatus: normalizeTicketStatus(entry.fromStatus, null),
    toStatus:
      normalizeTicketStatus(entry.toStatus ?? entry.status, fallbackStatus) ?? fallbackStatus,
    reason: asText(entry.reason),
    adminId: asNullableText(entry.adminId),
    createdAt: normalizeIsoDate(
      entry.createdAt ?? entry.created_at ?? entry.timestamp,
      fallbackCreatedAt,
    ),
  };
}

export function normalizeSupportTicket(value: unknown): SupportTicket {
  const ticket = asRecord(value);
  const status = normalizeTicketStatus(ticket.status, 'open') ?? 'open';
  const createdAt = normalizeIsoDate(ticket.createdAt ?? ticket.created_at, new Date(0).toISOString());

  return {
    id: asText(ticket.id),
    createdAt,
    userId: asText(ticket.userId ?? ticket.user_id),
    category: asText(ticket.category) || 'general',
    priority: normalizeTicketPriority(ticket.priority, 'normal') ?? 'normal',
    status,
    assigneeAdminId: asNullableText(ticket.assigneeAdminId ?? ticket.assignee_admin_id),
    notes: asArray(ticket.notes).map((note, index) => normalizeSupportTicketNote(note, index)),
    statusHistory: asArray(ticket.statusHistory ?? ticket.status_history).map((entry, index) =>
      normalizeSupportTicketHistoryEntry(entry, index, status),
    ),
    updatedAt: normalizeIsoDate(ticket.updatedAt ?? ticket.updated_at, createdAt),
  };
}

export function getTicketDisplayCode(ticketId: string): string {
  return `TKT-${ticketId.slice(0, 6).toUpperCase()}`;
}
