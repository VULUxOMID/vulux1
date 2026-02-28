type UiEvent = 'HOME_SCROLL_TOP';

type Listener = () => void;

const listeners: Record<UiEvent, Set<Listener>> = {
  HOME_SCROLL_TOP: new Set<Listener>(),
};

export function emitHomeScrollTop() {
  listeners.HOME_SCROLL_TOP.forEach((fn) => fn());
}

export function onHomeScrollTop(fn: Listener) {
  listeners.HOME_SCROLL_TOP.add(fn);
  return () => listeners.HOME_SCROLL_TOP.delete(fn);
}
