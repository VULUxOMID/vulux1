import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_SIGN_UP_IDENTITY_KEY = '@vulu.pending-sign-up-identity';

export type PendingSignUpIdentity = {
  email: string;
  username: string;
  displayName: string;
  createdAtMs: number;
};

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function savePendingSignUpIdentity(identity: {
  email: string;
  username: string;
  displayName: string;
}): Promise<void> {
  const email = normalizeString(identity.email).toLowerCase();
  const username = normalizeString(identity.username);
  const displayName = normalizeString(identity.displayName);
  if (!email || !username || !displayName) {
    return;
  }

  const payload: PendingSignUpIdentity = {
    email,
    username,
    displayName,
    createdAtMs: Date.now(),
  };
  await AsyncStorage.setItem(PENDING_SIGN_UP_IDENTITY_KEY, JSON.stringify(payload));
}

export async function readPendingSignUpIdentity(): Promise<PendingSignUpIdentity | null> {
  const raw = await AsyncStorage.getItem(PENDING_SIGN_UP_IDENTITY_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignUpIdentity>;
    const email = normalizeString(parsed.email).toLowerCase();
    const username = normalizeString(parsed.username);
    const displayName = normalizeString(parsed.displayName);
    const createdAtMs = typeof parsed.createdAtMs === 'number' && Number.isFinite(parsed.createdAtMs)
      ? parsed.createdAtMs
      : 0;
    if (!email || !username || !displayName) {
      return null;
    }
    return { email, username, displayName, createdAtMs };
  } catch {
    return null;
  }
}

export async function clearPendingSignUpIdentity(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SIGN_UP_IDENTITY_KEY);
}
