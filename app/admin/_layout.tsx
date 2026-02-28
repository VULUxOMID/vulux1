import { Stack } from 'expo-router';
import { AdminGate } from '../../src/features/admin/components/AdminGate';
import { AdminToastProvider } from '../../src/features/admin/components/AdminToastProvider';

export default function AdminLayout() {
    return (
        <AdminGate>
            <AdminToastProvider>
                <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="tickets/[ticketId]" />
                </Stack>
            </AdminToastProvider>
        </AdminGate>
    );
}
