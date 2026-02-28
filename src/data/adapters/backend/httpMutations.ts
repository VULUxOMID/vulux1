import type { BackendHttpClient } from './httpClient';

export async function postSafe(
  client: BackendHttpClient | null,
  path: string,
  body: unknown,
): Promise<void> {
  if (!client) return;
  try {
    await client.post(path, body);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[data/backend] POST "${path}" failed`, error);
    }
  }
}

export async function deleteSafe(
  client: BackendHttpClient | null,
  path: string,
  body: unknown,
): Promise<void> {
  if (!client) return;
  try {
    await client.del(path, body);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[data/backend] DELETE "${path}" failed`, error);
    }
  }
}

