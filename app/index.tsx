import { Redirect } from 'expo-router';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';

export default function Index() {
  const { isLoaded, hasSession, needsVerification } = useSessionAuth();

  if (!isLoaded) {
    return <Redirect href="/(tabs)" />;
  }

  if (hasSession && needsVerification) {
    return <Redirect href="/(auth)/verify-email" />;
  }

  if (hasSession) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)" />;
}
