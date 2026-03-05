const LEGACY_CALLER_USER_ID_CLAIM_PATHS = [
  ['userId'],
  ['user_id'],
  ['uid'],
  ['metadata', 'userId'],
  ['metadata', 'user_id'],
  ['publicMetadata', 'userId'],
  ['publicMetadata', 'user_id'],
  ['public_metadata', 'userId'],
  ['public_metadata', 'user_id'],
  ['unsafeMetadata', 'userId'],
  ['unsafeMetadata', 'user_id'],
  ['unsafe_metadata', 'userId'],
  ['unsafe_metadata', 'user_id'],
  ['sub'],
] as const;

type JsonRecord = Record<string, unknown>;

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readIdentityString(value: unknown): string | null {
  const direct = readString(value);
  if (direct) return direct;

  if (!value || typeof value !== 'object') return null;

  const withHex = value as { toHexString?: () => unknown };
  if (typeof withHex.toHexString === 'function') {
    const hex = readIdentityString(withHex.toHexString());
    if (hex) return hex;
  }

  const withString = value as { toString?: () => unknown };
  if (typeof withString.toString === 'function') {
    const text = readIdentityString(withString.toString());
    if (text && text !== '[object Object]') return text;
  }

  return null;
}

function readClaimPath(claims: JsonRecord, path: readonly string[]): unknown {
  let current: unknown = claims;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[segment];
  }
  return current;
}

export function readViewCallerIdentity(ctx: { sender?: unknown; identity?: unknown } | null | undefined): string | null {
  return readIdentityString(ctx?.sender) ?? readIdentityString(ctx?.identity);
}

export function selectLegacyCallerUserId(
  claims: JsonRecord | null,
  candidateExists: (candidate: string) => boolean,
): string | null {
  if (!claims) {
    return null;
  }

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const path of LEGACY_CALLER_USER_ID_CLAIM_PATHS) {
    const candidate = readString(readClaimPath(claims, path));
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return null;
  }

  const matchedCandidate = candidates.find((candidate) => candidateExists(candidate));
  return matchedCandidate ?? candidates[0] ?? null;
}
