import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { getTicketDisplayCode } from '../../../src/features/admin/models/support-ticket';
import { SupportTicketDetailScreen } from '../../../src/features/admin/screens/support-ticket-detail-screen';

export default function AdminOpsSupportTicketRoute() {
  const params = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const ticketIdValue = Array.isArray(params.ticketId) ? params.ticketId[0] : params.ticketId;
  const ticketId = ticketIdValue ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: ticketId ? getTicketDisplayCode(ticketId) : 'Support Ticket',
        }}
      />
      <SupportTicketDetailScreen ticketId={ticketId} />
    </>
  );
}
