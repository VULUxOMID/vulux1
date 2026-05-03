type ClerkConfigOptions = {
  env: Record<string, string | undefined>;
  expoExtra?: Record<string, unknown> | null;
  runtimeSearch?: string | null;
  runtimeStorageValue?: string | null;
};

export function resolveClerkPublishableKey({ env, expoExtra }: ClerkConfigOptions): string {
  const extraFallback =
    typeof expoExtra?.clerkPublishableKey === 'string' ? expoExtra.clerkPublishableKey.trim() : '';

  return (
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    extraFallback ||
    ''
  );
}

export function resolveClerkQaSignInTicket({
  env,
  expoExtra,
  runtimeSearch,
  runtimeStorageValue,
}: ClerkConfigOptions): string {
  const extraFallback =
    typeof expoExtra?.clerkQaSignInTicket === 'string' ? expoExtra.clerkQaSignInTicket.trim() : '';
  const runtimeQueryFallback = readRuntimeTicketQueryValue(runtimeSearch);
  const runtimeStorageFallback = normalizeString(runtimeStorageValue);

  return (
    env.QA_CLERK_SIGN_IN_TICKET?.trim() ||
    env.EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET?.trim() ||
    extraFallback ||
    runtimeQueryFallback ||
    runtimeStorageFallback ||
    ''
  );
}

function readRuntimeTicketQueryValue(search: string | null | undefined): string {
  const normalized = normalizeString(search);
  if (!normalized) {
    return '';
  }

  const params = new URLSearchParams(normalized.startsWith('?') ? normalized : `?${normalized}`);
  return normalizeString(params.get('qa_clerk_ticket')) ?? '';
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
