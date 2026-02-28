import { useCallback, useEffect, useState } from 'react';

import {
  type SupportTicket,
  type SupportTicketFilters,
} from '../models/support-ticket';
import { getSupportTicket, listSupportTickets } from '../services/support-tickets';
import { useAdminBackend } from './useAdminBackend';

export type { SupportTicket, SupportTicketFilters } from '../models/support-ticket';

export function useAdminSupportTickets(initialFilters?: SupportTicketFilters) {
  const { get } = useAdminBackend();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(
    async (filters?: SupportTicketFilters) => {
      setLoading(true);
      setError(null);

      try {
        const nextTickets = await listSupportTickets(get, filters ?? initialFilters);
        setTickets(nextTickets);
        return nextTickets;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load support tickets.';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [get, initialFilters],
  );

  useEffect(() => {
    void fetchTickets(initialFilters);
  }, [fetchTickets, initialFilters]);

  return {
    tickets,
    loading,
    error,
    refetch: fetchTickets,
    setTickets,
  };
}

export function useAdminSupportTicketDetail(ticketId: string | null | undefined) {
  const { get } = useAdminBackend();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) {
      setTicket(null);
      setError(null);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const nextTicket = await getSupportTicket(get, ticketId);
      setTicket(nextTicket);
      return nextTicket;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load ticket details.';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [get, ticketId]);

  useEffect(() => {
    void fetchTicket();
  }, [fetchTicket]);

  return {
    ticket,
    loading,
    error,
    refetch: fetchTicket,
    setTicket,
  };
}
