function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveLiveInviteActorName(
  displayName: string | null | undefined,
  username: string | null | undefined,
  authUserId: string,
): string {
  return normalizeString(displayName) ?? normalizeString(username) ?? authUserId;
}
