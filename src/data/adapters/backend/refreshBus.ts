export type BackendRefreshEvent = {
  scopes?: string[];
  reason?: string;
  source?: 'manual' | 'realtime' | 'fallback' | 'app_state';
  forceFull?: boolean;
};

type BackendRefreshListener = (event: BackendRefreshEvent) => void;

const listeners = new Set<BackendRefreshListener>();

export function subscribeBackendRefresh(listener: BackendRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestBackendRefresh(event: BackendRefreshEvent = {}): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      if (__DEV__) {
        console.warn('[data/backend] Failed to run refresh listener', error);
      }
    }
  });
}
