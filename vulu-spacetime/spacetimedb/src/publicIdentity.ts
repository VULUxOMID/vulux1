type JsonRecord = Record<string, unknown>;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstDefinedString(values: unknown[]): string | null {
  for (const value of values) {
    const normalized = readString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function resolvePublicIdentityFields(
  userId: string,
  profile: JsonRecord,
  social: JsonRecord,
  fallback: {
    summaryUsername?: unknown;
    userDisplayName?: unknown;
    summaryAvatarUrl?: unknown;
    userAvatarUrl?: unknown;
  } = {},
): {
  username: string;
  displayName: string;
  avatarUrl: string;
} {
  const displayName =
    firstDefinedString([
      profile.displayName,
      profile.name,
      social.name,
      fallback.userDisplayName,
      fallback.summaryUsername,
      profile.username,
      social.username,
    ]) ?? userId;

  const username =
    firstDefinedString([
      profile.username,
      social.username,
      fallback.summaryUsername,
      displayName,
    ]) ?? userId;

  const avatarUrl =
    firstDefinedString([
      profile.avatarUrl,
      social.avatarUrl,
      social.avatar,
      fallback.summaryAvatarUrl,
      fallback.userAvatarUrl,
    ]) ?? '';

  return {
    username,
    displayName,
    avatarUrl,
  };
}
