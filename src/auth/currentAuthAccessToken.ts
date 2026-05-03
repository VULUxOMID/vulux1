type AuthAccessTokenHandler = () => Promise<string | null>;

let currentAuthAccessTokenHandler: AuthAccessTokenHandler | null = null;

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function setCurrentAuthAccessTokenHandler(
  handler: AuthAccessTokenHandler | null,
): void {
  currentAuthAccessTokenHandler = handler;
}

export async function readCurrentAuthAccessToken(): Promise<string | null> {
  if (!currentAuthAccessTokenHandler) {
    return null;
  }

  return normalizeToken(await currentAuthAccessTokenHandler());
}
