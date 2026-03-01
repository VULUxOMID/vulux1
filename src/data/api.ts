import { createBackendHttpClientFromEnv } from './adapters/backend/httpClient';

type QueryParams = Record<string, unknown>;

type ApiClient = {
  setAuth: (token: string) => void;
  clearAuth: () => void;
  get: <T = any>(path: string, params?: QueryParams) => Promise<T>;
  post: <T = any>(path: string, body?: unknown) => Promise<T>;
  del: <T = any>(path: string, body?: unknown) => Promise<T>;
};

const backendClient = createBackendHttpClientFromEnv();

function ensureBackendClient() {
  if (!backendClient) {
    throw new Error(
      'Admin API is not configured. Set EXPO_PUBLIC_ADMIN_API_BASE_URL only if you still run the legacy admin service.',
    );
  }
  return backendClient;
}

export const apiClient: ApiClient = {
  setAuth(token: string) {
    if (!backendClient) return;
    backendClient.setAuth(token);
  },
  clearAuth() {
    if (!backendClient) return;
    backendClient.clearAuth();
  },
  get(path, params) {
    return ensureBackendClient().get(path, params);
  },
  post(path, body) {
    return ensureBackendClient().post(path, body);
  },
  del(path, body) {
    return ensureBackendClient().del(path, body);
  },
};
