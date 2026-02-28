import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function isForeground(state: AppStateStatus): boolean {
  return state !== 'background';
}

export function useAppIsActive(): boolean {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [isActive, setIsActive] = useState(isForeground(appStateRef.current));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      setIsActive(isForeground(nextState));
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return isActive;
}
