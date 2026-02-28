type BackendGetToken = (options?: { template?: string }) => Promise<string | null>;

const TEMPLATE_RETRY_COOLDOWN_MS = 60_000;
const templateRetryAtMs = new Map<string, number>();
const templateWarningLogged = new Set<string>();

export async function getBackendToken(
  getToken: BackendGetToken,
  tokenTemplate?: string,
): Promise<string | null> {
  const normalizedTemplate = tokenTemplate?.trim();
  const shouldTryTemplate =
    normalizedTemplate &&
    Date.now() >= (templateRetryAtMs.get(normalizedTemplate) ?? 0);

  if (normalizedTemplate && shouldTryTemplate) {
    try {
      const templatedToken = await getToken({ template: normalizedTemplate });
      if (templatedToken) {
        templateRetryAtMs.delete(normalizedTemplate);
        return templatedToken;
      }
    } catch {
      templateRetryAtMs.set(normalizedTemplate, Date.now() + TEMPLATE_RETRY_COOLDOWN_MS);
      if (__DEV__ && !templateWarningLogged.has(normalizedTemplate)) {
        templateWarningLogged.add(normalizedTemplate);
        console.warn(
          `[auth] Backend token template "${normalizedTemplate}" failed. Falling back to default session token.`,
        );
      }
    }
  }

  try {
    return await getToken();
  } catch {
    return null;
  }
}
