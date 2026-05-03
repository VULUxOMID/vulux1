import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  createDemoRoom,
  fetchDemoRoom,
  fetchDemoState,
  inviteDemoUser,
  joinDemoRoom,
  leaveDemoRoom,
  loginDemo,
  respondToDemoInvite,
  startDemoRoom,
} from './demoApi';
import type { DemoInvite, DemoRoom, DemoStateSnapshot } from './types';

const STORAGE_KEY = 'vulu.demo.username';
const POLL_INTERVAL_MS = 3_000;

type DemoContextValue = {
  isReady: boolean;
  syncing: boolean;
  username: string | null;
  activeRooms: DemoRoom[];
  myRooms: DemoRoom[];
  pendingInvites: DemoInvite[];
  error: string | null;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  getRoom: (roomId: string) => Promise<DemoRoom>;
  createRoom: (title: string) => Promise<DemoRoom>;
  startRoom: (roomId: string) => Promise<DemoRoom>;
  joinRoom: (roomId: string) => Promise<DemoRoom>;
  leaveRoom: (roomId: string) => Promise<DemoRoom>;
  inviteUser: (roomId: string, targetUsername: string) => Promise<DemoInvite>;
  respondToInvite: (inviteId: string, accept: boolean) => Promise<DemoRoom>;
};

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

const EMPTY_SNAPSHOT: Omit<DemoStateSnapshot, 'username'> = {
  activeRooms: [],
  myRooms: [],
  pendingInvites: [],
};

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: DemoStateSnapshot) => {
    setSnapshot({
      activeRooms: next.activeRooms,
      myRooms: next.myRooms,
      pendingInvites: next.pendingInvites,
    });
    setError(null);
  }, []);

  const refreshForUsername = useCallback(
    async (nextUsername: string, silent = false) => {
      if (!silent) {
        setSyncing(true);
      }

      try {
        const nextSnapshot = await fetchDemoState(nextUsername);
        applySnapshot(nextSnapshot);
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : 'Failed to load demo state.';
        setError(message);
        throw refreshError;
      } finally {
        if (!silent) {
          setSyncing(false);
        }
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStoredUsername() {
      try {
        const storedUsername = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;

        if (storedUsername) {
          setUsername(storedUsername);
          await refreshForUsername(storedUsername);
        }
      } catch (storageError) {
        if (!cancelled) {
          const message =
            storageError instanceof Error ? storageError.message : 'Failed to restore demo session.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    }

    void loadStoredUsername();

    return () => {
      cancelled = true;
    };
  }, [refreshForUsername]);

  useEffect(() => {
    if (!isReady || !username) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshForUsername(username, true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isReady, refreshForUsername, username]);

  const login = useCallback(
    async (nextUsername: string) => {
      const session = await loginDemo(nextUsername);
      await AsyncStorage.setItem(STORAGE_KEY, session.username);
      setUsername(session.username);
      await refreshForUsername(session.username);
    },
    [refreshForUsername],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUsername(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!username) return;
    await refreshForUsername(username);
  }, [refreshForUsername, username]);

  const requireUsername = useCallback((): string => {
    if (!username) {
      throw new Error('No demo user is signed in.');
    }
    return username;
  }, [username]);

  const getRoom = useCallback(
    async (roomId: string) => {
      const activeUsername = requireUsername();
      const response = await fetchDemoRoom(roomId, activeUsername);
      return response.room;
    },
    [requireUsername],
  );

  const createRoom = useCallback(
    async (title: string) => {
      const activeUsername = requireUsername();
      const response = await createDemoRoom(activeUsername, title);
      await refreshForUsername(activeUsername, true);
      return response.room;
    },
    [refreshForUsername, requireUsername],
  );

  const startRoom = useCallback(
    async (roomId: string) => {
      const activeUsername = requireUsername();
      const response = await startDemoRoom(roomId, activeUsername);
      await refreshForUsername(activeUsername, true);
      return response.room;
    },
    [refreshForUsername, requireUsername],
  );

  const joinRoom = useCallback(
    async (roomId: string) => {
      const activeUsername = requireUsername();
      const response = await joinDemoRoom(roomId, activeUsername);
      await refreshForUsername(activeUsername, true);
      return response.room;
    },
    [refreshForUsername, requireUsername],
  );

  const leaveRoom = useCallback(
    async (roomId: string) => {
      const activeUsername = requireUsername();
      const response = await leaveDemoRoom(roomId, activeUsername);
      await refreshForUsername(activeUsername, true);
      return response.room;
    },
    [refreshForUsername, requireUsername],
  );

  const inviteUser = useCallback(
    async (roomId: string, targetUsername: string) => {
      const activeUsername = requireUsername();
      const response = await inviteDemoUser(roomId, activeUsername, targetUsername);
      await refreshForUsername(activeUsername, true);
      return response.invite;
    },
    [refreshForUsername, requireUsername],
  );

  const respondToInvite = useCallback(
    async (inviteId: string, accept: boolean) => {
      const activeUsername = requireUsername();
      const response = await respondToDemoInvite(inviteId, activeUsername, accept);
      await refreshForUsername(activeUsername, true);
      return response.room;
    },
    [refreshForUsername, requireUsername],
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      isReady,
      syncing,
      username,
      activeRooms: snapshot.activeRooms,
      myRooms: snapshot.myRooms,
      pendingInvites: snapshot.pendingInvites,
      error,
      login,
      logout,
      refresh,
      getRoom,
      createRoom,
      startRoom,
      joinRoom,
      leaveRoom,
      inviteUser,
      respondToInvite,
    }),
    [
      createRoom,
      error,
      getRoom,
      inviteUser,
      isReady,
      joinRoom,
      leaveRoom,
      login,
      logout,
      refresh,
      respondToInvite,
      snapshot.activeRooms,
      snapshot.myRooms,
      snapshot.pendingInvites,
      startRoom,
      syncing,
      username,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider.');
  }
  return context;
}
