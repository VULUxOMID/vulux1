import { spacetimeDb } from './spacetime';

export type LiveMutationErrorCode =
  | 'unauthenticated'
  | 'reducers_unavailable'
  | 'invite_only'
  | 'banned'
  | 'unauthorized'
  | 'not_found'
  | 'live_ended'
  | 'invalid_input'
  | 'unknown';

export type LiveMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: LiveMutationErrorCode;
      message: string;
      cause?: unknown;
    };

type LiveMutationFailure = Extract<LiveMutationResult, { ok: false }>;

export type StartLiveInput = {
  liveId: string;
  ownerUserId: string;
  title: string;
  inviteOnly: boolean;
  viewers: number;
  hosts: Array<Record<string, unknown>>;
  bannedUserIds?: string[];
  id?: string;
};

export type UpdateLiveInput = {
  liveId: string;
  title?: string;
  inviteOnly?: boolean;
  viewers?: number;
  hosts?: Array<Record<string, unknown>>;
  bannedUserIds?: string[];
  id?: string;
};

export type SetLivePresenceInput = {
  userId: string;
  activity: 'hosting' | 'watching' | 'none';
  liveId?: string;
  liveTitle?: string;
  id?: string;
};

export type EndLiveInput = {
  liveId: string;
  actorUserId?: string;
  id?: string;
};

export type BanLiveUserInput = {
  liveId: string;
  targetUserId: string;
  actorUserId?: string;
  id?: string;
};

export type BoostLiveInput = {
  liveId: string;
  amount: number;
  actorUserId?: string;
  id?: string;
};

export type TickLiveEventInput = {
  liveId: string;
  id?: string;
};

type ReducerCaller = (args: Record<string, unknown>) => Promise<unknown>;

const failureLogAtByKey = new Map<string, number>();
const FAILURE_LOG_THROTTLE_MS = 5_000;
const LIVE_TITLE_MAX_LENGTH = 80;

function makeReducerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toFailure(
  code: LiveMutationErrorCode,
  message: string,
  cause?: unknown,
): LiveMutationFailure {
  return {
    ok: false,
    code,
    message,
    cause,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLiveTitle(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized.slice(0, LIVE_TITLE_MAX_LENGTH);
}

function normalizeInteger(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.floor(asNumber));
    }
  }
  return fallback;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown live mutation error';
  }
}

function mapLiveMutationError(operation: string, error: unknown): LiveMutationResult {
  const rawMessage = describeError(error);
  const lowerMessage = rawMessage.toLowerCase();

  if (lowerMessage.includes('invite only')) {
    return toFailure('invite_only', 'Invite only', error);
  }
  if (
    lowerMessage.includes("you're banned") ||
    lowerMessage.includes('you are banned') ||
    lowerMessage.includes('banned from live')
  ) {
    return toFailure('banned', "You're banned", error);
  }
  if (
    lowerMessage.includes('reducers are unavailable') ||
    lowerMessage.includes('reducer unavailable')
  ) {
    return toFailure('reducers_unavailable', 'Live service is unavailable right now.', error);
  }
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('only admins') ||
    lowerMessage.includes('must own live') ||
    lowerMessage.includes('must match caller') ||
    lowerMessage.includes('must be an active participant')
  ) {
    return toFailure('unauthorized', 'You are not authorized to perform this live action.', error);
  }
  if (lowerMessage.includes('has ended') || lowerMessage.includes('already ended')) {
    return toFailure('live_ended', 'Live has ended', error);
  }
  if (lowerMessage.includes('not found')) {
    return toFailure('not_found', 'This live could not be found.', error);
  }
  if (lowerMessage.includes('required') || lowerMessage.includes('invalid')) {
    return toFailure('invalid_input', `Invalid ${operation} request.`, error);
  }
  return toFailure('unknown', `Failed to ${operation}.`, error);
}

function logLiveMutationFailure(
  operation: string,
  result: LiveMutationFailure,
): void {
  const key = `${operation}:${result.code}:${result.message}`;
  const now = Date.now();
  const lastLoggedAt = failureLogAtByKey.get(key) ?? 0;
  if (now - lastLoggedAt < FAILURE_LOG_THROTTLE_MS) {
    return;
  }
  failureLogAtByKey.set(key, now);

  console.warn('[live] mutation_failed', {
    operation,
    code: result.code,
    message: result.message,
    cause: describeError(result.cause),
  });
}

function resolveReducer(reducerNames: string[]): ReducerCaller | null {
  const reducers = spacetimeDb.reducers as Record<string, unknown> | null | undefined;
  if (!reducers) return null;

  for (const reducerName of reducerNames) {
    const reducer = reducers[reducerName];
    if (typeof reducer === 'function') {
      return reducer as ReducerCaller;
    }
  }

  return null;
}

async function runReducerMutation(
  operation: string,
  reducerNames: string[],
  args: Record<string, unknown>,
): Promise<LiveMutationResult> {
  const reducer = resolveReducer(reducerNames);
  if (!reducer) {
    const failure = toFailure(
      'reducers_unavailable',
      `Live reducer unavailable for ${operation}.`,
    );
    logLiveMutationFailure(operation, failure);
    return failure;
  }

  try {
    await reducer(args);
    return { ok: true };
  } catch (error) {
    const failure = mapLiveMutationError(operation, error);
    if (!failure.ok) {
      logLiveMutationFailure(operation, failure);
    }
    return failure;
  }
}

function startLive(input: StartLiveInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  const ownerUserId = normalizeString(input.ownerUserId);
  if (!liveId || !ownerUserId) {
    return Promise.resolve(
      toFailure('invalid_input', 'A live id and owner user id are required to start live.'),
    );
  }

  const title = normalizeLiveTitle(input.title) ?? 'Live';
  const hosts = Array.isArray(input.hosts) ? input.hosts : [];
  const bannedUserIds = Array.isArray(input.bannedUserIds) ? input.bannedUserIds : [];

  return runReducerMutation('start_live', ['startLive', 'start_live'], {
    id: input.id ?? makeReducerId('live-start'),
    liveId,
    ownerUserId,
    title,
    inviteOnly: input.inviteOnly === true,
    viewers: normalizeInteger(input.viewers, 1),
    hosts: JSON.stringify(hosts),
    bannedUserIds: JSON.stringify(bannedUserIds),
  });
}

function updateLive(input: UpdateLiveInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    return Promise.resolve(toFailure('invalid_input', 'A live id is required to update live.'));
  }

  return runReducerMutation('update_live', ['updateLive', 'update_live'], {
    id: input.id ?? makeReducerId('live-update'),
    liveId,
    title: normalizeLiveTitle(input.title),
    inviteOnly: typeof input.inviteOnly === 'boolean' ? input.inviteOnly : null,
    viewers:
      typeof input.viewers === 'number' && Number.isFinite(input.viewers)
        ? normalizeInteger(input.viewers)
        : null,
    hosts: Array.isArray(input.hosts) ? JSON.stringify(input.hosts) : null,
    bannedUserIds: Array.isArray(input.bannedUserIds)
      ? JSON.stringify(input.bannedUserIds)
      : null,
  });
}

async function endLive(input: EndLiveInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    return toFailure('invalid_input', 'A live id is required to end live.');
  }

  const result = await runReducerMutation('end_live', ['endLive', 'end_live'], {
    id: input.id ?? makeReducerId('live-end'),
    liveId,
    actorUserId: normalizeString(input.actorUserId),
  });

  if (!result.ok && result.code === 'not_found') {
    return { ok: true };
  }

  return result;
}

function setLivePresence(input: SetLivePresenceInput): Promise<LiveMutationResult> {
  const userId = normalizeString(input.userId);
  if (!userId) {
    return Promise.resolve(toFailure('invalid_input', 'A user id is required for live presence.'));
  }

  const activity =
    input.activity === 'hosting' || input.activity === 'watching' ? input.activity : 'none';
  const liveId = normalizeString(input.liveId);

  return runReducerMutation('set_live_presence', ['setLivePresence', 'set_live_presence'], {
    id: input.id ?? makeReducerId('live-presence'),
    userId,
    activity,
    liveId: liveId ?? null,
    liveTitle: normalizeLiveTitle(input.liveTitle),
  });
}

function banLiveUser(input: BanLiveUserInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  const targetUserId = normalizeString(input.targetUserId);
  if (!liveId || !targetUserId) {
    return Promise.resolve(
      toFailure('invalid_input', 'A live id and target user id are required to ban a user.'),
    );
  }

  return runReducerMutation('ban_live_user', ['banLiveUser', 'ban_live_user'], {
    id: input.id ?? makeReducerId('live-ban'),
    liveId,
    targetUserId,
    actorUserId: normalizeString(input.actorUserId),
  });
}

function unbanLiveUser(input: BanLiveUserInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  const targetUserId = normalizeString(input.targetUserId);
  if (!liveId || !targetUserId) {
    return Promise.resolve(
      toFailure('invalid_input', 'A live id and target user id are required to unban a user.'),
    );
  }

  return runReducerMutation('unban_live_user', ['unbanLiveUser', 'unban_live_user'], {
    id: input.id ?? makeReducerId('live-unban'),
    liveId,
    targetUserId,
    actorUserId: normalizeString(input.actorUserId),
  });
}

function boostLive(input: BoostLiveInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    return Promise.resolve(toFailure('invalid_input', 'A live id is required to boost live.'));
  }

  return runReducerMutation('boost_live', ['boostLive', 'boost_live'], {
    id: input.id ?? makeReducerId('live-boost'),
    liveId,
    actorUserId: normalizeString(input.actorUserId),
    amount: Math.max(1, normalizeInteger(input.amount, 1)),
  });
}

function tickLiveEvent(input: TickLiveEventInput): Promise<LiveMutationResult> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    return Promise.resolve(
      toFailure('invalid_input', 'A live id is required to tick live events.'),
    );
  }

  return runReducerMutation('tick_live_event', ['tickLiveEvent', 'tick_live_event'], {
    id: input.id ?? makeReducerId('live-tick'),
    liveId,
  });
}

export const liveLifecycleClient = {
  startLive,
  updateLive,
  endLive,
  setLivePresence,
  banLiveUser,
  unbanLiveUser,
  boostLive,
  tickLiveEvent,
};
