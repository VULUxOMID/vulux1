function normalize(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const CLERK_OVERRIDE_QUERY_PARAM = 'clerk_key';
const CLERK_OVERRIDE_STORAGE_KEY = 'vulu.qa.clerk_publishable_key';

function readEnvPublishableKey(): string {
  return (
    normalize(process.env.EXPO_PUBLIC_QA_CLERK_PUBLISHABLE_KEY) ??
    normalize(process.env.NEXT_PUBLIC_QA_CLERK_PUBLISHABLE_KEY) ??
    normalize(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) ??
    normalize(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ??
    ''
  );
}

export function readConfiguredClerkPublishableKey(): string {
  const envPublishableKey = readEnvPublishableKey();

  if (typeof window === 'undefined' || typeof window.location?.search !== 'string') {
    return envPublishableKey;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const override = normalize(params.get(CLERK_OVERRIDE_QUERY_PARAM));
    if (override) {
      window.localStorage.setItem(CLERK_OVERRIDE_STORAGE_KEY, override);
      return override;
    }

    const stored = normalize(window.localStorage.getItem(CLERK_OVERRIDE_STORAGE_KEY));
    return stored ?? envPublishableKey;
  } catch {
    return envPublishableKey;
  }
}

export function buildClerkOverrideUrl(baseUrl: string, publishableKey: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(CLERK_OVERRIDE_QUERY_PARAM, publishableKey);
  return url.toString();
}
