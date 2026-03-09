import { Redirect, useLocalSearchParams } from 'expo-router';

export default function AdminLegacySupportTicketRedirect() {
  const params = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const ticketIdValue = Array.isArray(params.ticketId) ? params.ticketId[0] : params.ticketId;
  const ticketId = ticketIdValue ?? '';

  return (
    <Redirect
      href={{ pathname: '/admin-v2/tickets/[ticketId]' as any, params: { ticketId } }}
    />
  );
}
