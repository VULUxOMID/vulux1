import {
  normalizeSupportTicket,
  type SupportTicket,
  type SupportTicketFilters,
  type TicketPriority,
  type TicketStatus,
} from '../models/support-ticket';

type AdminGet = <T>(path: string, params?: Record<string, unknown>) => Promise<T>;
type AdminPost = <T>(path: string, body?: unknown) => Promise<T>;

type TicketEnvelope = {
  ticket?: unknown;
};

type TicketListEnvelope = {
  tickets?: unknown[];
};

function normalizeTicketList(value: unknown): SupportTicket[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((ticket) => normalizeSupportTicket(ticket));
}

export async function listSupportTickets(
  get: AdminGet,
  filters?: SupportTicketFilters,
): Promise<SupportTicket[]> {
  const response = await get<TicketListEnvelope>('/api/admin/tickets', filters);
  return normalizeTicketList(response?.tickets);
}

export async function getSupportTicket(
  get: AdminGet,
  ticketId: string,
): Promise<SupportTicket> {
  const response = await get<TicketEnvelope>(`/api/admin/tickets/${ticketId}`);
  return normalizeSupportTicket(response?.ticket);
}

export async function updateSupportTicketStatus(
  post: AdminPost,
  ticketId: string,
  status: TicketStatus,
  reason: string,
): Promise<SupportTicket> {
  const response = await post<TicketEnvelope>(`/api/admin/tickets/${ticketId}/status`, {
    status,
    reason,
  });
  return normalizeSupportTicket(response?.ticket);
}

export async function addSupportTicketNote(
  post: AdminPost,
  ticketId: string,
  note: string,
): Promise<SupportTicket> {
  const response = await post<TicketEnvelope>(`/api/admin/tickets/${ticketId}/notes`, {
    note,
  });
  return normalizeSupportTicket(response?.ticket);
}

export async function assignSupportTicket(
  post: AdminPost,
  ticketId: string,
  assigneeAdminId: string | null,
): Promise<SupportTicket> {
  const response = await post<TicketEnvelope>(`/api/admin/tickets/${ticketId}/assign`, {
    assigneeAdminId,
  });
  return normalizeSupportTicket(response?.ticket);
}

export async function setSupportTicketPriority(
  post: AdminPost,
  ticketId: string,
  priority: TicketPriority,
): Promise<SupportTicket> {
  const response = await post<TicketEnvelope>(`/api/admin/tickets/${ticketId}/priority`, {
    priority,
  });
  return normalizeSupportTicket(response?.ticket);
}

export async function bulkResolveSupportTickets(
  post: AdminPost,
  ticketIds: string[],
  reason: string,
): Promise<SupportTicket[]> {
  const response = await post<TicketListEnvelope>('/api/admin/tickets/bulk-resolve', {
    ticketIds,
    reason,
  });
  return normalizeTicketList(response?.tickets);
}

export async function bulkAssignSupportTickets(
  post: AdminPost,
  ticketIds: string[],
  assigneeAdminId: string | null,
): Promise<SupportTicket[]> {
  const response = await post<TicketListEnvelope>('/api/admin/tickets/bulk-assign', {
    ticketIds,
    assigneeAdminId,
  });
  return normalizeTicketList(response?.tickets);
}
