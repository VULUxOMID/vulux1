import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type SecureStoreLike = {
  getItemAsync?: (key: string) => Promise<string | null>;
  setItemAsync?: (key: string, value: string) => Promise<void>;
  deleteItemAsync?: (key: string) => Promise<void>;
};

const secureStore = SecureStore as SecureStoreLike;

type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function readLocalStorage():
  | WebStorageLike
  | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  const storage = (globalThis as { localStorage?: unknown }).localStorage;
  if (
    !storage ||
    typeof storage !== 'object' ||
    typeof (storage as WebStorageLike).getItem !== 'function' ||
    typeof (storage as WebStorageLike).setItem !== 'function' ||
    typeof (storage as WebStorageLike).removeItem !== 'function'
  ) {
    return null;
  }

  return storage as WebStorageLike;
}

function warnCompat(message: string, error?: unknown): void {
  if (!__DEV__) {
    return;
  }

  if (typeof error === 'undefined') {
    console.warn(`[secure-store] ${message}`);
    return;
  }
  console.warn(`[secure-store] ${message}`, error);
}

export async function secureStoreGetItem(key: string): Promise<string | null> {
  const webStorage = readLocalStorage();
  if (webStorage) {
    try {
      return webStorage.getItem(key);
    } catch (error) {
      warnCompat(`Failed to read key "${key}" from web localStorage.`, error);
      return null;
    }
  }

  if (typeof secureStore.getItemAsync !== 'function') {
    warnCompat(`getItemAsync is unavailable for key "${key}".`);
    return null;
  }

  try {
    return await secureStore.getItemAsync(key);
  } catch (error) {
    warnCompat(`Failed to read key "${key}" from SecureStore.`, error);
    return null;
  }
}

export async function secureStoreSetItem(key: string, value: string): Promise<boolean> {
  const webStorage = readLocalStorage();
  if (webStorage) {
    try {
      webStorage.setItem(key, value);
      return true;
    } catch (error) {
      warnCompat(`Failed to write key "${key}" to web localStorage.`, error);
      return false;
    }
  }

  if (typeof secureStore.setItemAsync !== 'function') {
    warnCompat(`setItemAsync is unavailable for key "${key}".`);
    return false;
  }

  try {
    await secureStore.setItemAsync(key, value);
    return true;
  } catch (error) {
    warnCompat(`Failed to write key "${key}" to SecureStore.`, error);
    return false;
  }
}

export async function secureStoreDeleteItem(key: string): Promise<boolean> {
  const webStorage = readLocalStorage();
  if (webStorage) {
    try {
      webStorage.removeItem(key);
      return true;
    } catch (error) {
      warnCompat(`Failed to remove key "${key}" from web localStorage.`, error);
      return false;
    }
  }

  if (typeof secureStore.deleteItemAsync !== 'function') {
    warnCompat(`deleteItemAsync is unavailable for key "${key}".`);
    return false;
  }

  try {
    await secureStore.deleteItemAsync(key);
    return true;
  } catch (error) {
    warnCompat(`Failed to remove key "${key}" from SecureStore.`, error);
    return false;
  }
}
