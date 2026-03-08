import { Redirect } from 'expo-router';

export default function AdminLegacyIndexRedirect() {
  return <Redirect href="/admin-v2" />;
}
