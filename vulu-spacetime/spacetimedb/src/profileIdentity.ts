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

export function resolveProfileIdentityFields(
  payload: JsonRecord,
  existingProfile: JsonRecord,
  existingSocial: JsonRecord,
): {
  username: string;
  displayName: string;
  name: string;
} {
  const username =
    firstDefinedString([
      payload.username,
      payload.displayName,
      payload.name,
      existingProfile.username,
      existingProfile.displayName,
      existingProfile.name,
      existingSocial.username,
      existingSocial.name,
    ]) ?? '';

  const displayName =
    firstDefinedString([
      payload.displayName,
      payload.name,
      payload.username,
      existingProfile.displayName,
      existingProfile.name,
      existingProfile.username,
      existingSocial.name,
      existingSocial.username,
    ]) ?? '';

  const name =
    firstDefinedString([
      payload.name,
      payload.displayName,
      existingProfile.name,
      existingProfile.displayName,
      existingProfile.username,
      existingSocial.name,
      existingSocial.username,
    ]) ?? '';

  return {
    username,
    displayName,
    name,
  };
}
