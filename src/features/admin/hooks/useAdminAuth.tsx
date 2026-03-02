import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../../context/AuthContext';
import { auditLogger } from '../utils/auditLogger';
import {
  type AdminAction,
  type AdminRole,
  can,
  resolveHighestAdminRole,
} from '../utils/permissions';
import {
  ADMIN_IDLE_WARNING_MS,
  DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES,
  getAdminSessionTimeoutMinutes,
  getAdminSessionTimeoutMs,
  setAdminSessionTimeoutMinutes as persistAdminSessionTimeoutMinutes,
} from '../services/adminSessionManager';

type AdminChallengeReason = 'initial' | 'expired' | 'background' | 'locked';

const ADMIN_IDLE_WARNING_SECONDS = Math.floor(ADMIN_IDLE_WARNING_MS / 1000);

interface AdminContextState {
  isAdmin: boolean;
  adminRole: AdminRole | null;
  isOwner: boolean;
  isAuthedForAdmin: boolean;
  setAuthedForAdmin: (value: boolean) => void;
  markAdminActivity: () => void;
  extendAdminSession: () => void;
  expireAdminSession: (reason?: Exclude<AdminChallengeReason, 'initial'>) => void;
  lastActivityAt: number | null;
  authChallengeReason: AdminChallengeReason;
  sessionTimeoutMinutes: number;
  sessionTimeoutReady: boolean;
  setSessionTimeoutMinutes: (minutes: number) => Promise<number>;
  warningThresholdSeconds: number;
  secondsRemaining: number | null;
  isSessionWarningVisible: boolean;
  canPerform: (action: AdminAction) => boolean;
}

const AdminContext = createContext<AdminContextState | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAuthedForAdmin, setIsAuthedForAdmin] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [authChallengeReason, setAuthChallengeReason] =
    useState<AdminChallengeReason>('initial');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutesState] = useState(
    DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES,
  );
  const [sessionTimeoutReady, setSessionTimeoutReady] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());

  const expiryLoggedRef = useRef(false);
  const authedUserIdRef = useRef<string | null>(null);

  const { user, roles } = useAuth();
  const userId = user?.uid ?? null;

  const adminRole = useMemo(() => resolveHighestAdminRole(roles), [roles]);

  const isAdminUser = Boolean(adminRole);
  const isOwner = adminRole === 'OWNER';
  const canPerform = useCallback((action: AdminAction) => can(action, adminRole), [adminRole]);
  const sessionTimeoutMs = useMemo(
    () => getAdminSessionTimeoutMs(sessionTimeoutMinutes),
    [sessionTimeoutMinutes],
  );

  const clearSession = useCallback((reason: Exclude<AdminChallengeReason, 'initial'>) => {
    authedUserIdRef.current = null;
    setIsAuthedForAdmin(false);
    setLastActivityAt(null);
    setClockMs(Date.now());
    setAuthChallengeReason(reason);
  }, []);

  const setAuthed = useCallback((value: boolean) => {
    const now = Date.now();
    expiryLoggedRef.current = false;
    authedUserIdRef.current = value ? userId : null;
    setIsAuthedForAdmin(value);
    setLastActivityAt(value ? now : null);
    setClockMs(now);
    setAuthChallengeReason(value ? 'initial' : 'locked');
  }, [userId]);

  const markAdminActivity = useCallback(() => {
    if (!isAuthedForAdmin) return;

    const now = Date.now();
    expiryLoggedRef.current = false;
    setLastActivityAt(now);
    setClockMs(now);
  }, [isAuthedForAdmin]);

  const extendAdminSession = useCallback(() => {
    if (!isAuthedForAdmin) return;

    markAdminActivity();
    auditLogger.log({
      adminId: 'current-admin',
      actionType: 'ADMIN_SESSION_EXTENDED',
      targetType: 'system',
      targetId: 'admin-session',
      reason: 'Extended admin session from expiry warning',
    });
  }, [isAuthedForAdmin, markAdminActivity]);

  const expireAdminSession = useCallback(
    (reason: Exclude<AdminChallengeReason, 'initial'> = 'locked') => {
      clearSession(reason);
    },
    [clearSession],
  );

  const setSessionTimeoutMinutes = useCallback(async (minutes: number) => {
    const nextMinutes = await persistAdminSessionTimeoutMinutes(minutes);
    const now = Date.now();
    setSessionTimeoutMinutesState(nextMinutes);
    setSessionTimeoutReady(true);
    setClockMs(now);
    setLastActivityAt((currentValue) => (currentValue === null ? null : now));
    expiryLoggedRef.current = false;
    return nextMinutes;
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const savedMinutes = await getAdminSessionTimeoutMinutes();
      if (!active) return;
      setSessionTimeoutMinutesState(savedMinutes);
      setSessionTimeoutReady(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if ((nextAppState === 'background' || nextAppState === 'inactive') && isAuthedForAdmin) {
        clearSession('background');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clearSession, isAuthedForAdmin]);

  useEffect(() => {
    if (!isAuthedForAdmin) {
      return;
    }

    if (!isAdminUser || authedUserIdRef.current !== userId) {
      clearSession('locked');
    }
  }, [clearSession, isAdminUser, isAuthedForAdmin, userId]);

  useEffect(() => {
    if (!isAuthedForAdmin) return undefined;

    const interval = setInterval(() => {
      setClockMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthedForAdmin]);

  const secondsRemaining = useMemo(() => {
    if (!isAuthedForAdmin || lastActivityAt === null) return null;

    const remainingMs = lastActivityAt + sessionTimeoutMs - clockMs;
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / 1000);
  }, [clockMs, isAuthedForAdmin, lastActivityAt, sessionTimeoutMs]);

  const isSessionWarningVisible =
    secondsRemaining !== null &&
    secondsRemaining > 0 &&
    secondsRemaining <= ADMIN_IDLE_WARNING_SECONDS;

  useEffect(() => {
    if (!isAuthedForAdmin || secondsRemaining === null || secondsRemaining > 0) {
      return;
    }

    if (!expiryLoggedRef.current) {
      expiryLoggedRef.current = true;
      auditLogger.log({
        adminId: 'current-admin',
        actionType: 'ADMIN_SESSION_EXPIRED',
        targetType: 'system',
        targetId: 'admin-session',
        reason: 'Admin session expired after idle timeout',
        payload: { sessionTimeoutMinutes },
      });
    }

    clearSession('expired');
  }, [clearSession, isAuthedForAdmin, secondsRemaining, sessionTimeoutMinutes]);

  return (
    <AdminContext.Provider
      value={{
        isAdmin: isAdminUser,
        adminRole,
        isOwner,
        isAuthedForAdmin,
        setAuthedForAdmin: setAuthed,
        markAdminActivity,
        extendAdminSession,
        expireAdminSession,
        lastActivityAt,
        authChallengeReason,
        sessionTimeoutMinutes,
        sessionTimeoutReady,
        setSessionTimeoutMinutes,
        warningThresholdSeconds: ADMIN_IDLE_WARNING_SECONDS,
        secondsRemaining,
        isSessionWarningVisible,
        canPerform,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdminAuth = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminProvider');
  return ctx;
};
