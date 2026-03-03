import { t } from 'spacetimedb/server';

import { spacetimedb as schemaDb } from './schema';

type JsonRecord = Record<string, unknown>;
type JsonArray = unknown[];

const MAX_THREAD_MESSAGES = 500;
const LIVE_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const LIVE_EVENT_WINNER_INTERVAL_MS = 15 * 60 * 1000;
const GEMS_TO_FUEL_RATE = 4;
const GEM_TO_CASH_RATE = 10;
const CASH_TO_GEM_RATE = 10;
const AD_REWARD_GEMS = 10;

const FUEL_PACK_COSTS: Record<number, { gems: number; cash: number }> = {
  30: { gems: 12, cash: 120 },
  60: { gems: 20, cash: 200 },
  120: { gems: 35, cash: 350 },
  300: { gems: 80, cash: 800 },
  600: { gems: 150, cash: 1500 },
};

const TRUSTED_GEM_PURCHASE_AMOUNTS = new Set([100, 550, 1200, 2500]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is JsonArray {
  return Array.isArray(value);
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (typeof value !== 'string' || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): JsonArray {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toJsonString(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstDefinedString(values: unknown[]): string | null {
  for (const value of values) {
    const normalized = readString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function isLikelyOpaqueUserId(value: string | null | undefined): boolean {
  const normalized = readString(value);
  if (!normalized) return false;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }

  if (/^[0-9a-f]{32,64}$/i.test(normalized)) {
    return true;
  }

  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(normalized)) {
    return true;
  }

  if (/^user_[0-9A-Za-z]+$/.test(normalized)) {
    return true;
  }

  return false;
}

function shortUserId(value: string | null | undefined): string | null {
  const normalized = readString(value);
  if (!normalized) return null;
  if (normalized.length <= 10) return normalized;
  return normalized.slice(0, 8);
}

function resolveFriendlyUserLabel(
  userId: string | null | undefined,
  preferredValues: unknown[],
): string {
  let firstReadableCandidate: string | null = null;

  for (const value of preferredValues) {
    const normalized = readString(value);
    if (!normalized) continue;

    if (!firstReadableCandidate) {
      firstReadableCandidate = normalized;
    }

    if (!isLikelyOpaqueUserId(normalized)) {
      return normalized;
    }
  }

  if (firstReadableCandidate && !isLikelyOpaqueUserId(firstReadableCandidate)) {
    return firstReadableCandidate;
  }

  const shortId = shortUserId(userId);
  if (shortId) {
    return `User ${shortId}`;
  }

  return 'Unknown';
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readBooleanLike(value: unknown): boolean | null {
  const direct = readBoolean(value);
  if (direct !== null) {
    return direct;
  }

  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return null;
}

function unwrapQuotedString(value: string): string {
  let current = value.trim();
  for (let depth = 0; depth < 2; depth += 1) {
    const startsWithDoubleQuote = current.startsWith('"') && current.endsWith('"');
    const startsWithSingleQuote = current.startsWith("'") && current.endsWith("'");
    if (!startsWithDoubleQuote && !startsWithSingleQuote) {
      break;
    }
    current = current.slice(1, -1).trim();
  }
  return current;
}

function readNormalizedStringArg(value: unknown): string | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  const unwrapped = unwrapQuotedString(normalized);
  return readString(unwrapped);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = readNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function timestampToMs(value: unknown): number {
  const direct = readNumber(value);
  if (direct !== null) return direct;

  if (isRecord(value)) {
    if (typeof value.toMillis === 'function') {
      const millis = readNumber(value.toMillis());
      if (millis !== null) return millis;
    }

    const micros = readNumber(
      value.microsSinceUnixEpoch ?? value.__timestamp_micros_since_unix_epoch__,
    );
    if (micros !== null) {
      return Math.floor(micros / 1000);
    }
  }

  return Date.now();
}

function nowMs(ctx: { timestamp: unknown }): number {
  return timestampToMs(ctx.timestamp);
}

function makeId(ctx: { timestamp: unknown; random: () => number }, prefix: string): string {
  const ts = nowMs(ctx);
  const rand = Math.floor(ctx.random() * 1_000_000_000)
    .toString(36)
    .padStart(6, '0');
  return `${prefix}-${ts}-${rand}`;
}

function randomHexDigit(ctx: { random: () => number }): string {
  return Math.floor(ctx.random() * 16).toString(16);
}

function makeUuid(ctx: { random: () => number }): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let output = '';

  for (const char of template) {
    if (char === 'x') {
      output += randomHexDigit(ctx);
      continue;
    }
    if (char === 'y') {
      const value = (Math.floor(ctx.random() * 16) & 0x3) | 0x8;
      output += value.toString(16);
      continue;
    }
    output += char;
  }

  return output;
}

function toIsoString(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function buildDefaultDisplayName(
  email: string | null | undefined,
  subject: string | null | undefined,
): string {
  const normalizedEmail = readString(email);
  if (normalizedEmail) {
    const localPart = normalizedEmail.split('@')[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  const normalizedSubject = readString(subject);
  if (!normalizedSubject) {
    return 'Vulu user';
  }

  return `vulu-${normalizedSubject.slice(0, 8)}`;
}

type SocialPresenceStatus = 'live' | 'online' | 'busy' | 'offline' | 'recent';

function normalizeSocialPresenceStatus(value: unknown): SocialPresenceStatus | null {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === 'live' ||
    normalized === 'online' ||
    normalized === 'busy' ||
    normalized === 'offline' ||
    normalized === 'recent'
  ) {
    return normalized;
  }

  return null;
}

function socialPresenceIsOnline(status: SocialPresenceStatus): boolean {
  return status === 'live' || status === 'online' || status === 'busy';
}

function resolveSocialPresenceStatus(
  sources: Array<
    | {
        status?: unknown;
        presenceStatus?: unknown;
        accountStatus?: unknown;
        isLive?: unknown;
        isOnline?: unknown;
      }
    | null
    | undefined
  >,
  fallback: SocialPresenceStatus = 'offline',
): SocialPresenceStatus {
  for (const source of sources) {
    if (!source) continue;

    const direct =
      normalizeSocialPresenceStatus(source.status) ??
      normalizeSocialPresenceStatus(source.presenceStatus) ??
      normalizeSocialPresenceStatus(source.accountStatus);
    if (direct) return direct;

    if (readBoolean(source.isLive) === true) {
      return 'live';
    }
    if (readBoolean(source.isOnline) === true) {
      return 'online';
    }
  }

  return fallback;
}

const CURRENT_IDENTITY_PROVIDER = 'clerk';

const LEGACY_CALLER_USER_ID_CLAIM_PATHS = [
  ['sub'],
  ['userId'],
  ['user_id'],
  ['uid'],
  ['metadata', 'userId'],
  ['metadata', 'user_id'],
  ['publicMetadata', 'userId'],
  ['publicMetadata', 'user_id'],
  ['public_metadata', 'userId'],
  ['public_metadata', 'user_id'],
  ['unsafeMetadata', 'userId'],
  ['unsafeMetadata', 'user_id'],
  ['unsafe_metadata', 'userId'],
  ['unsafe_metadata', 'user_id'],
] as const;

const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'super_admin',
  'superadmin',
  'owner',
]);
const BOOTSTRAP_ADMIN_USER_ID = '45d3c56c-a930-449b-9a3c-ef039f45eed7';
const BOOTSTRAP_ADMIN_AUDIT_ACTION = 'bootstrap_admin_granted';
const DB_OWNER_IDENTITY = 'c20098b71eb2493299cb336ffda41a6682345cb88ce35688278821d1dbaa8f51';

function unauthorized(message: string): never {
  throw new Error(`Unauthorized: ${message}`);
}

function readJwtClaims(ctx: any): JsonRecord | null {
  const claims = ctx?.senderAuth?.jwt?.fullPayload;
  return isRecord(claims) ? claims : null;
}

function readClaimPath(claims: JsonRecord, path: readonly string[]): unknown {
  let current: unknown = claims;
  for (const segment of path) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return current;
}

function readIdentityString(value: unknown): string | null {
  if (typeof value === 'string') {
    return readString(value);
  }

  if (!isRecord(value)) return null;

  if (typeof value.toHexString === 'function') {
    const hex = readString(value.toHexString());
    if (hex) return hex;
  }

  if (typeof value.toString === 'function') {
    const text = readString(value.toString());
    if (text && text !== '[object Object]') return text;
  }

  return null;
}

function readCallerIdentityHex(ctx: any): string | null {
  return readIdentityString(ctx?.sender) ?? readIdentityString(ctx?.identity);
}

function callerIsDbOwnerIdentity(ctx: any): boolean {
  const callerIdentity = readIdentityString(ctx?.identity);
  return callerIdentity?.toLowerCase() === DB_OWNER_IDENTITY;
}

function readLegacyCallerUserIdFromClaims(ctx: any): string | null {
  const claims = readJwtClaims(ctx);
  if (!claims) return null;

  for (const path of LEGACY_CALLER_USER_ID_CLAIM_PATHS) {
    const value = readString(readClaimPath(claims, path));
    if (value) return value;
  }

  return null;
}

function buildIdentityLookupKey(provider: string, issuer: string, subject: string): string {
  return `${provider.trim().toLowerCase()}::${issuer.trim()}::${subject.trim()}`;
}

function readCallerAuthIdentity(ctx: any): { issuer: string; subject: string } | null {
  const claims = readJwtClaims(ctx);
  const issuer = readString(claims?.iss);
  const subject = readString(claims?.sub);
  if (!issuer || !subject) {
    return null;
  }
  return { issuer, subject };
}

function readUserIdentityByLookupKey(ctx: any, lookupKey: string) {
  const find = ctx?.db?.userIdentity?.lookupKey?.find;
  if (typeof find !== 'function') {
    return null;
  }
  return find(lookupKey) ?? null;
}

function findUserIdentity(
  ctx: any,
  provider: string,
  issuer: string,
  subject: string,
) {
  return readUserIdentityByLookupKey(ctx, buildIdentityLookupKey(provider, issuer, subject));
}

function resolveMappedCallerUserId(ctx: any): string | null {
  const authIdentity = readCallerAuthIdentity(ctx);
  if (!authIdentity) {
    return null;
  }

  const row = findUserIdentity(
    ctx,
    CURRENT_IDENTITY_PROVIDER,
    authIdentity.issuer,
    authIdentity.subject,
  );
  return readString(row?.vuluUserId);
}

function userHasAdminRole(ctx: any, userId: string | null | undefined): boolean {
  const normalizedUserId = readString(userId);
  if (!normalizedUserId) {
    return false;
  }

  for (const row of ctx.db.userRole.iter()) {
    if (row.vuluUserId !== normalizedUserId) {
      continue;
    }

    const role = readString(row.role)?.toLowerCase();
    if (role && ADMIN_ROLE_NAMES.has(role)) {
      return true;
    }
  }

  return false;
}

function isEnabledUserRoleRow(row: any): boolean {
  return readBoolean((row as JsonRecord)?.enabled) !== false;
}

function countEnabledAdminRoles(ctx: any): number {
  let count = 0;
  for (const row of ctx.db.userRole.iter()) {
    const role = readString(row.role)?.toLowerCase();
    if (role === 'admin' && isEnabledUserRoleRow(row)) {
      count += 1;
    }
  }
  return count;
}

function hasAdminRole(ctx: any): boolean {
  return userHasAdminRole(
    ctx,
    resolveMappedCallerUserId(ctx) ?? readLegacyCallerUserIdFromClaims(ctx),
  );
}

function resolveCallerUserId(ctx: any): string {
  const mappedUserId = resolveMappedCallerUserId(ctx);
  if (mappedUserId) return mappedUserId;

  const legacyUserId = readLegacyCallerUserIdFromClaims(ctx);
  if (legacyUserId) return legacyUserId;

  if (!readCallerAuthIdentity(ctx)) {
    const identityHex = readCallerIdentityHex(ctx);
    if (identityHex) return identityHex;
  }

  unauthorized(
    'caller vulu_user_id could not be resolved. Ensure resolve_or_create_user_identity ran first.',
  );
}

function assertSelf(ctx: any, userId: string, fieldName = 'userId'): string {
  const callerUserId = resolveCallerUserId(ctx);
  if (callerUserId === userId) return callerUserId;
  if (hasAdminRole(ctx)) return callerUserId;
  unauthorized(`${fieldName} must match caller identity.`);
}

function assertOptionalIdentityMatchesCaller(
  ctx: any,
  providedUserId: string | null,
  fieldName: string,
): string {
  const callerUserId = resolveCallerUserId(ctx);
  if (providedUserId && providedUserId !== callerUserId) {
    unauthorized(`${fieldName} must match caller identity when provided.`);
  }
  return callerUserId;
}

function assertAdmin(ctx: any): string {
  const callerUserId = resolveCallerUserId(ctx);
  if (!hasAdminRole(ctx)) {
    unauthorized('admin role is required.');
  }
  return callerUserId;
}

function assertIdentityMatchesCallerAuth(
  ctx: any,
  provider: string,
  issuer: string,
  subject: string,
): void {
  const normalizedProvider = readString(provider)?.toLowerCase();
  if (!normalizedProvider) {
    unauthorized('provider is required.');
  }

  if (normalizedProvider !== CURRENT_IDENTITY_PROVIDER) {
    unauthorized(`unsupported identity provider "${provider}".`);
  }

  const authIdentity = readCallerAuthIdentity(ctx);
  if (!authIdentity) {
    unauthorized('JWT iss/sub claims are required for identity mapping.');
  }

  if (authIdentity.issuer !== issuer || authIdentity.subject !== subject) {
    unauthorized('identity reducer arguments must match the authenticated Clerk JWT.');
  }
}

function readUserRow(ctx: any, vuluUserId: string) {
  return ctx.db.users.vuluUserId.find(vuluUserId) ?? null;
}

function ensureUserRow(
  ctx: any,
  vuluUserId: string,
  email: string | null,
  subject: string,
): void {
  if (readUserRow(ctx, vuluUserId)) {
    return;
  }

  ctx.db.users.insert({
    vuluUserId,
    createdAt: ctx.timestamp,
    displayName: buildDefaultDisplayName(email, subject),
    avatar: undefined,
    isBanned: false,
    banStatus: 'active',
    banReason: undefined,
  });
}

function upsertUserRole(
  ctx: any,
  vuluUserId: string,
  role: string,
  enabled: boolean,
  grantedBy: string | null,
): void {
  const normalizedRole = readString(role)?.toLowerCase();
  if (!normalizedRole) {
    throw new Error('role is required.');
  }

  const roleId = `${vuluUserId}::${normalizedRole}`;
  const existing = ctx.db.userRole.id.find(roleId);

  if (!enabled) {
    if (existing) {
      ctx.db.userRole.id.delete(roleId);
    }
    return;
  }

  if (existing) {
    ctx.db.userRole.id.delete(roleId);
  }

  ctx.db.userRole.insert({
    id: roleId,
    vuluUserId,
    role: normalizedRole,
    grantedAt: ctx.timestamp,
    grantedBy: grantedBy ?? undefined,
  });
}

function ensureDefaultUserRole(ctx: any, vuluUserId: string): void {
  upsertUserRole(ctx, vuluUserId, 'user', true, null);
}

function appendBootstrapAdminGrantAuditLog(
  ctx: any,
  actorUserId: string,
  targetUserId: string,
): void {
  const createdAtMs = nowMs(ctx);
  const item: JsonRecord = {
    category: 'admin_bootstrap',
    actionType: BOOTSTRAP_ADMIN_AUDIT_ACTION,
    actorUserId,
    targetUserId,
    role: 'admin',
    enabled: true,
    createdAt: createdAtMs,
  };

  ctx.db.auditLogItem.insert({
    id: makeId(ctx, 'audit-bootstrap-admin'),
    actorUserId,
    item: toJsonString(item),
    createdAt: ctx.timestamp,
  });
}

type ResolveIdentityArgs = {
  provider: string;
  issuer: string;
  subject: string;
  email?: string | null;
  emailVerified: boolean;
};

function resolveOrCreateUserIdentityCore(
  ctx: any,
  args: ResolveIdentityArgs,
  source: 'reducer' | 'procedure',
): string {
  const provider = readString(args.provider)?.toLowerCase();
  const issuer = readString(args.issuer);
  const subject = readString(args.subject);
  const email = readString(args.email);

  if (!provider || !issuer || !subject) {
    throw new Error('provider, issuer, and subject are required.');
  }

  console.info(
    `[auth] ${source} resolve_or_create_user_identity start provider=${provider} issuer=${issuer} subject=${subject}`,
  );

  try {
    assertIdentityMatchesCallerAuth(ctx, provider, issuer, subject);

    const existingIdentity = findUserIdentity(ctx, provider, issuer, subject);
    if (existingIdentity) {
      const existingVuluUserId = readString(existingIdentity.vuluUserId);
      if (!existingVuluUserId) {
        throw new Error('Existing identity row is missing vuluUserId.');
      }

      ensureUserRow(ctx, existingVuluUserId, email, subject);
      ensureDefaultUserRole(ctx, existingVuluUserId);
      console.info(
        `[auth] ${source} resolve_or_create_user_identity existing vulu_user_id=${existingVuluUserId}`,
      );
      return existingVuluUserId;
    }

    // vulu_user_id is the app-wide primary key. Provider identities only map into it.
    const vuluUserId = makeUuid(ctx);
    ensureUserRow(ctx, vuluUserId, email, subject);

    ctx.db.userIdentity.insert({
      id: makeUuid(ctx),
      vuluUserId,
      provider,
      issuer,
      subject,
      email: email ?? undefined,
      emailVerified: readBoolean(args.emailVerified) === true,
      lookupKey: buildIdentityLookupKey(provider, issuer, subject),
      createdAt: ctx.timestamp,
    });

    ensureDefaultUserRole(ctx, vuluUserId);
    console.info(
      `[auth] ${source} resolve_or_create_user_identity created vulu_user_id=${vuluUserId}`,
    );
    return vuluUserId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[auth] ${source} resolve_or_create_user_identity failed provider=${provider} issuer=${issuer} subject=${subject}: ${message}`,
    );
    throw error;
  }
}

function parsePairUsers(pairKey: string): [string, string] | null {
  const users = pairKey
    .split('::')
    .map((entry) => entry.trim())
    .filter((entry): entry is string => entry.length > 0);
  if (users.length !== 2) return null;
  return [users[0]!, users[1]!];
}

function assertPairMatchesParticipants(pairKey: string, userAId: string, userBId: string): void {
  const parsed = parsePairUsers(pairKey);
  if (!parsed) {
    throw new Error('Invalid pairKey.');
  }

  const pairUsersNormalized = buildPairKey(parsed[0], parsed[1]);
  const expected = buildPairKey(userAId, userBId);
  if (pairUsersNormalized !== expected) {
    unauthorized('pairKey does not match provided participants.');
  }
}

function readLiveOwnerUserId(live: JsonRecord): string | null {
  const ownerUserId = readString(live.ownerUserId);
  if (ownerUserId) return ownerUserId;

  const hosts = normalizeHostList(live.hosts);
  if (hosts.length === 0) return null;
  return readString(hosts[0]?.id);
}

function isLiveHostUser(live: JsonRecord, userId: string): boolean {
  return normalizeHostList(live.hosts).some((host) => readString(host.id) === userId);
}

function isLiveEnded(live: JsonRecord): boolean {
  const endedAt = toNonNegativeInt(live.endedAt);
  if (endedAt > 0) return true;
  return normalizeHostList(live.hosts).length === 0;
}

function isUserGloballyBanned(ctx: any, userId: string): boolean {
  const userRow = readUserRow(ctx, userId);
  if (!userRow) return false;
  if (userRow.isBanned === true) return true;

  const banStatus = readString(userRow.banStatus)?.toLowerCase();
  return banStatus === 'banned' || banStatus === 'suspended';
}

function assertCallerNotGloballyBanned(ctx: any, userId: string): void {
  if (isUserGloballyBanned(ctx, userId)) {
    unauthorized("You're banned.");
  }
}

function parseLiveRoomId(roomId: string): { liveId: string; strict: boolean } | null {
  const normalizedRoomId = readString(roomId);
  if (!normalizedRoomId) return null;

  const lower = normalizedRoomId.toLowerCase();
  if (lower === 'global') return null;
  if (lower.startsWith('live:invite:')) return null;

  if (lower.startsWith('live:')) {
    const liveId = readString(normalizedRoomId.slice('live:'.length));
    if (!liveId) return null;
    return { liveId, strict: true };
  }

  if (lower.startsWith('live-')) {
    return { liveId: normalizedRoomId, strict: true };
  }

  return { liveId: normalizedRoomId, strict: false };
}

function assertLiveParticipationAllowed(
  ctx: any,
  liveId: string,
  callerUserId: string,
): JsonRecord {
  assertCallerNotGloballyBanned(ctx, callerUserId);

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0 || isLiveEnded(live)) {
    throw new Error('Live has ended.');
  }

  const bannedUserIds = new Set(normalizeBannedUserIds(live.bannedUserIds));
  if (bannedUserIds.has(callerUserId)) {
    unauthorized("You're banned.");
  }

  if (readBoolean(live.inviteOnly) === true) {
    const ownerUserId = readLiveOwnerUserId(live);
    const callerIsHost =
      (ownerUserId !== null && ownerUserId === callerUserId) ||
      isLiveHostUser(live, callerUserId);

    if (!callerIsHost) {
      const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
      if (!invitedUserIds.has(callerUserId)) {
        unauthorized('Invite only.');
      }
    }
  }

  return live;
}

function authorizeLivePresencePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
  const requestedUserId = readString(payload.userId);
  if (
    requestedUserId &&
    requestedUserId !== callerUserId &&
    (!legacyCallerUserId || requestedUserId !== legacyCallerUserId)
  ) {
    unauthorized('live_presence userId must match caller identity.');
  }
  const normalizedUserId = requestedUserId ?? legacyCallerUserId ?? callerUserId;
  payload.userId = normalizedUserId;

  const normalizedActivity = readString(payload.activity)?.toLowerCase();
  if (
    normalizedActivity !== 'hosting' &&
    normalizedActivity !== 'watching' &&
    normalizedActivity !== 'none'
  ) {
    throw new Error('live_presence activity must be hosting, watching, or none.');
  }
  payload.activity = normalizedActivity;

  if (normalizedActivity === 'none') {
    payload.liveId = undefined;
    payload.liveTitle = undefined;
    return;
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    unauthorized('liveId is required when setting live presence.');
  }

  const live = assertLiveParticipationAllowed(ctx, liveId, normalizedUserId);
  if (normalizedActivity === 'hosting') {
    assertLiveOwnerOrAdmin(ctx, liveId, live);
  }

  payload.liveId = liveId;
}

function authorizeLiveInvitePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
  const inviterUserId = readString(payload.inviterUserId);
  if (
    inviterUserId &&
    inviterUserId !== callerUserId &&
    (!legacyCallerUserId || inviterUserId !== legacyCallerUserId)
  ) {
    unauthorized('live_invite inviterUserId must match caller identity.');
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_invite liveId is required.');
  }

  if (!readString(payload.targetUserId)) {
    throw new Error('live_invite targetUserId is required.');
  }

  const live = assertLiveParticipationAllowed(ctx, liveId, callerUserId);
  assertLiveOwnerOrAdmin(ctx, liveId, live);
  payload.liveId = liveId;
  payload.inviterUserId = inviterUserId ?? legacyCallerUserId ?? callerUserId;
}

function authorizeLiveHostRequestPayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
  const requesterUserId = readString(payload.requesterUserId);
  if (
    requesterUserId &&
    requesterUserId !== callerUserId &&
    (!legacyCallerUserId || requesterUserId !== legacyCallerUserId)
  ) {
    unauthorized('live_host_request requesterUserId must match caller identity.');
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_host_request liveId is required.');
  }

  const normalizedRequesterUserId = requesterUserId ?? legacyCallerUserId ?? callerUserId;
  const live = assertLiveParticipationAllowed(ctx, liveId, normalizedRequesterUserId);
  assertLiveParticipantOrAdmin(ctx, liveId, live);
  if (isLiveHostUser(live, normalizedRequesterUserId)) {
    unauthorized('Hosts cannot request to become co-hosts.');
  }

  payload.liveId = liveId;
  payload.requesterUserId = normalizedRequesterUserId;
}

function authorizeLiveHostRequestResponsePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  assertCallerNotGloballyBanned(ctx, callerUserId);

  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_host_request_response liveId is required.');
  }

  const requesterUserId = readString(payload.requesterUserId);
  if (!requesterUserId) {
    throw new Error('live_host_request_response requesterUserId is required.');
  }

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) {
    throw new Error(`Live "${liveId}" not found.`);
  }
  assertLiveOwnerOrAdmin(ctx, liveId, live);

  payload.liveId = liveId;
  payload.requesterUserId = requesterUserId;
  payload.accepted = readBooleanLike(payload.accepted) ?? false;
  payload.hostUserId = callerUserId;
}

function authorizeLiveInviteResponsePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
  const targetUserId = readString(payload.targetUserId);
  if (
    targetUserId &&
    targetUserId !== callerUserId &&
    (!legacyCallerUserId || targetUserId !== legacyCallerUserId)
  ) {
    unauthorized('live_invite_response targetUserId must match caller identity.');
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_invite_response liveId is required.');
  }

  const normalizedTargetUserId = targetUserId ?? legacyCallerUserId ?? callerUserId;
  const live = assertLiveParticipationAllowed(ctx, liveId, normalizedTargetUserId);
  const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
  if (!invitedUserIds.has(normalizedTargetUserId) && !isLiveHostUser(live, normalizedTargetUserId)) {
    unauthorized('No active invite for this user.');
  }

  payload.liveId = liveId;
  payload.targetUserId = normalizedTargetUserId;
  payload.accepted = readBooleanLike(payload.accepted) ?? false;
  payload.responderUserId = normalizedTargetUserId;
}

function authorizeLiveChatPayload(
  ctx: any,
  roomId: string,
  payload: JsonRecord,
): void {
  const callerUserId = resolveCallerUserId(ctx);
  const senderId = readString(payload.senderId);
  if (senderId && senderId !== callerUserId) {
    unauthorized('global chat senderId must match caller identity.');
  }
  payload.senderId = callerUserId;

  const normalizedRoomId = readString(roomId) ?? readString(payload.roomId) ?? 'global';
  payload.roomId = normalizedRoomId;

  const liveRoom = parseLiveRoomId(normalizedRoomId);
  if (!liveRoom) return;

  const live = readLiveItem(ctx, liveRoom.liveId);
  if (Object.keys(live).length === 0) {
    if (liveRoom.strict) {
      throw new Error('Live has ended.');
    }
    return;
  }

  if (isLiveEnded(live)) {
    throw new Error('Live has ended.');
  }

  assertLiveParticipationAllowed(ctx, liveRoom.liveId, callerUserId);
}

function assertLiveOwnerOrAdmin(ctx: any, liveId: string, live: JsonRecord): string {
  const callerUserId = resolveCallerUserId(ctx);
  if (hasAdminRole(ctx)) return callerUserId;

  const ownerUserId = readLiveOwnerUserId(live);
  if (ownerUserId && ownerUserId === callerUserId) return callerUserId;
  if (isLiveHostUser(live, callerUserId)) return callerUserId;

  unauthorized(`caller must own live "${liveId}".`);
}

function assertLiveParticipantOrAdmin(ctx: any, liveId: string, live: JsonRecord): string {
  const callerUserId = resolveCallerUserId(ctx);
  if (hasAdminRole(ctx)) return callerUserId;

  if (isLiveHostUser(live, callerUserId)) return callerUserId;

  const callerPresence = readLivePresenceItem(ctx, callerUserId);
  if (readString(callerPresence.liveId) === liveId) {
    return callerUserId;
  }

  unauthorized(`caller must be an active participant in live "${liveId}".`);
}

function authorizeGlobalMessagePayload(
  ctx: any,
  roomId: string,
  payload: JsonRecord,
): string | null {
  let eventType = readString(payload.eventType);
  if (!eventType && readString(payload.text)) {
    eventType = 'global_chat_message';
    payload.eventType = eventType;
  }

  if (!eventType) {
    if (!hasAdminRole(ctx)) {
      unauthorized('only admins may send untyped global message payloads.');
    }
    return null;
  }

  if (eventType === 'global_chat_message') {
    authorizeLiveChatPayload(ctx, roomId, payload);
    return eventType;
  }

  if (eventType === 'video_catalog_item') {
    const callerUserId = resolveCallerUserId(ctx);
    const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
    const creatorId = readString(payload.creatorId);
    if (creatorId && creatorId !== callerUserId && (!legacyCallerUserId || creatorId !== legacyCallerUserId)) {
      unauthorized('video_catalog_item creatorId must match caller identity.');
    }
    payload.creatorId = creatorId ?? legacyCallerUserId ?? callerUserId;
    return eventType;
  }

  if (eventType === 'music_track_item') {
    const callerUserId = resolveCallerUserId(ctx);
    const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
    const uploaderUserId = readString(payload.uploaderUserId);
    if (
      uploaderUserId &&
      uploaderUserId !== callerUserId &&
      (!legacyCallerUserId || uploaderUserId !== legacyCallerUserId)
    ) {
      unauthorized('music_track_item uploaderUserId must match caller identity.');
    }
    payload.uploaderUserId = uploaderUserId ?? legacyCallerUserId ?? callerUserId;
    return eventType;
  }

  if (eventType === 'media_upload') {
    const callerUserId = resolveCallerUserId(ctx);
    const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
    const ownerUserId = readString(payload.ownerUserId);
    if (ownerUserId && ownerUserId !== callerUserId && (!legacyCallerUserId || ownerUserId !== legacyCallerUserId)) {
      unauthorized('media_upload ownerUserId must match caller identity.');
    }
    payload.ownerUserId = ownerUserId ?? legacyCallerUserId ?? callerUserId;
    return eventType;
  }

  if (eventType === 'live_invite') {
    authorizeLiveInvitePayload(ctx, payload);
    return eventType;
  }

  if (eventType === 'live_host_request') {
    authorizeLiveHostRequestPayload(ctx, payload);
    return eventType;
  }

  if (eventType === 'live_host_request_response') {
    authorizeLiveHostRequestResponsePayload(ctx, payload);
    return eventType;
  }

  if (eventType === 'live_invite_response') {
    authorizeLiveInviteResponsePayload(ctx, payload);
    return eventType;
  }

  if (eventType === 'live_presence') {
    authorizeLivePresencePayload(ctx, payload);
    return eventType;
  }

  if (eventType === 'live_start') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
    const ownerUserId = readString(payload.ownerUserId);
    if (
      ownerUserId &&
      ownerUserId !== callerUserId &&
      (!legacyCallerUserId || ownerUserId !== legacyCallerUserId)
    ) {
      unauthorized('live_start ownerUserId must match caller identity.');
    }
    if (!readString(payload.liveId)) {
      throw new Error('live_start liveId is required.');
    }
    payload.ownerUserId = ownerUserId ?? legacyCallerUserId ?? callerUserId;
    return eventType;
  }

  if (eventType === 'live_update') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_update liveId is required.');
    }
    const live = readLiveItem(ctx, liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, liveId, live);
    return eventType;
  }

  if (eventType === 'live_ban') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_ban liveId is required.');
    }
    if (!readString(payload.targetUserId)) {
      throw new Error('live_ban targetUserId is required.');
    }
    const live = readLiveItem(ctx, liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, liveId, live);
    payload.actorUserId = callerUserId;
    return eventType;
  }

  if (eventType === 'live_unban') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_unban liveId is required.');
    }
    if (!readString(payload.targetUserId)) {
      throw new Error('live_unban targetUserId is required.');
    }
    const live = readLiveItem(ctx, liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, liveId, live);
    payload.actorUserId = callerUserId;
    return eventType;
  }

  if (eventType === 'live_end') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_end liveId is required.');
    }
    const live = readLiveItem(ctx, liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, liveId, live);
    payload.actorUserId = callerUserId;
    return eventType;
  }

  if (eventType === 'live_boost') {
    const callerUserId = resolveCallerUserId(ctx);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_boost liveId is required.');
    }
    const live = assertLiveParticipationAllowed(ctx, liveId, callerUserId);
    assertLiveParticipantOrAdmin(ctx, liveId, live);
    payload.actorUserId = callerUserId;
    return eventType;
  }

  if (eventType === 'live_event_tick') {
    const callerUserId = resolveCallerUserId(ctx);
    assertCallerNotGloballyBanned(ctx, callerUserId);
    const liveId = readString(payload.liveId);
    if (!liveId) {
      throw new Error('live_event_tick liveId is required.');
    }
    const live = readLiveItem(ctx, liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, liveId, live);
    return eventType;
  }

  if (!hasAdminRole(ctx)) {
    unauthorized(`only admins may emit "${eventType}" through sendGlobalMessage.`);
  }

  return eventType;
}

function deepMerge(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMerge(merged[key] as JsonRecord, value);
      continue;
    }
    merged[key] = value;
  }

  return merged;
}

function buildPairKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('::');
}

function buildConversationKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('::');
}

function buildConversationRowId(ownerUserId: string, otherUserId: string): string {
  return `${ownerUserId}::${otherUserId}`;
}

function buildThreadRowId(ownerUserId: string, otherUserId: string): string {
  return `${ownerUserId}::${otherUserId}`;
}

function upsertGlobalMessageRow(
  ctx: any,
  id: string,
  roomId: string,
  item: string,
  createdAt: any = ctx.timestamp,
): void {
  const existing = ctx.db.globalMessageItem.id.find(id);
  if (existing) {
    ctx.db.globalMessageItem.id.delete(id);
  }
  ctx.db.globalMessageItem.insert({
    id,
    roomId,
    item,
    createdAt,
  });
}

function readMutableGlobalChatMessage(ctx: any, id: string): {
  row: any;
  payload: JsonRecord;
  callerUserId: string;
} {
  const row = ctx.db.globalMessageItem.id.find(id);
  if (!row) {
    throw new Error(`global_message_not_found:${id}`);
  }

  const payload = parseJsonRecord(row.item);
  const eventType = readString(payload.eventType) ?? (readString(payload.text) ? 'global_chat_message' : null);
  if (eventType !== 'global_chat_message') {
    unauthorized('only global chat messages may be modified.');
  }

  const callerUserId = resolveCallerUserId(ctx);
  const senderId = readString(payload.senderId);
  if (!hasAdminRole(ctx) && (!senderId || senderId !== callerUserId)) {
    unauthorized('only the sender may modify this global chat message.');
  }

  return { row, payload, callerUserId };
}

function readSocialUserItem(ctx: any, userId: string): JsonRecord {
  const row = ctx.db.socialUserItem.userId.find(userId);
  if (!row) return {};
  return parseJsonRecord(row.item);
}

function writeSocialUserItem(ctx: any, userId: string, item: JsonRecord): void {
  const existing = ctx.db.socialUserItem.userId.find(userId);
  if (existing) {
    ctx.db.socialUserItem.userId.delete(userId);
  }

  ctx.db.socialUserItem.insert({
    userId,
    item: toJsonString(item),
    updatedAt: ctx.timestamp,
  });

  refreshPublicProfileSummaryItem(ctx, userId);
}

function readUserProfileItem(ctx: any, userId: string): JsonRecord {
  const row = ctx.db.userProfileItem.userId.find(userId);
  if (!row) return {};
  return parseJsonRecord(row.profile);
}

function writeUserProfileItem(ctx: any, userId: string, profile: JsonRecord): void {
  const existing = ctx.db.userProfileItem.userId.find(userId);
  if (existing) {
    ctx.db.userProfileItem.userId.delete(userId);
  }

  ctx.db.userProfileItem.insert({
    userId,
    profile: toJsonString(profile),
    updatedAt: ctx.timestamp,
  });

  refreshPublicProfileSummaryItem(ctx, userId);
}

function refreshPublicProfileSummaryItem(ctx: any, userId: string): void {
  const profile = readUserProfileItem(ctx, userId);
  const social = readSocialUserItem(ctx, userId);
  const status = resolveSocialPresenceStatus([
    {
      status: social.status,
      isLive: social.isLive,
      isOnline: social.isOnline,
    },
  ]);

  const username =
    readString(profile.username) ??
    readString(profile.displayName) ??
    readString(social.username) ??
    readString(social.name) ??
    userId;

  const avatarUrl =
    readString(profile.avatarUrl) ??
    readString(social.avatarUrl) ??
    readString(social.avatar) ??
    '';

  const badge = readString(profile.badge) ?? readString(social.badge);
  const spotlightStatus =
    readString(profile.spotlightStatus) ??
    readString(profile.spotlight) ??
    readString(social.spotlightStatus);

  const existing = ctx.db.publicProfileSummaryItem.userId.find(userId);
  if (existing) {
    ctx.db.publicProfileSummaryItem.userId.delete(userId);
  }

  ctx.db.publicProfileSummaryItem.insert({
    userId,
    username,
    avatarUrl,
    badge,
    spotlightStatus,
  });
}

function readPublicProfileSummaryItem(ctx: any, userId: string | null | undefined) {
  const normalizedUserId = readString(userId);
  if (!normalizedUserId) return null;
  return ctx.db.publicProfileSummaryItem.userId.find(normalizedUserId) ?? null;
}

function readAccountStateItem(ctx: any, userId: string): JsonRecord {
  const row = ctx.db.accountStateItem.userId.find(userId);
  if (!row) return {};
  return parseJsonRecord(row.state);
}

function writeAccountStateItem(ctx: any, userId: string, state: JsonRecord): void {
  const existing = ctx.db.accountStateItem.userId.find(userId);
  if (existing) {
    ctx.db.accountStateItem.userId.delete(userId);
  }

  ctx.db.accountStateItem.insert({
    userId,
    state: toJsonString(state),
    updatedAt: ctx.timestamp,
  });

  upsertPublicLeaderboardItemFromState(ctx, userId, state);
}

function upsertPublicLeaderboardItemFromState(
  ctx: any,
  userId: string,
  state: JsonRecord,
): void {
  const walletState = isRecord(state.wallet) ? state.wallet : {};
  const cash = toNonNegativeInt(walletState.cash);
  const score = toNonNegativeInt(walletState.score, cash);
  const gold = toNonNegativeInt(walletState.gold, cash);
  const gems = toNonNegativeInt(walletState.gems);

  const existing = ctx.db.publicLeaderboardItem.userId.find(userId);
  if (existing) {
    ctx.db.publicLeaderboardItem.userId.delete(userId);
  }

  ctx.db.publicLeaderboardItem.insert({
    userId,
    score,
    gold,
    gems,
  });
}

type WalletState = {
  gems: number;
  cash: number;
  fuel: number;
  withdrawalHistory: unknown[];
};

type WalletDelta = {
  gems: number;
  cash: number;
  fuel: number;
};

function readWalletFromAccountState(accountState: JsonRecord): WalletState {
  const wallet = isRecord(accountState.wallet) ? accountState.wallet : {};

  return {
    gems: toNonNegativeInt(wallet.gems),
    cash: toNonNegativeInt(wallet.cash),
    fuel: toNonNegativeInt(wallet.fuel),
    withdrawalHistory: isArray(wallet.withdrawalHistory) ? wallet.withdrawalHistory : [],
  };
}

function writeWalletToAccountState(
  accountState: JsonRecord,
  wallet: WalletState,
): JsonRecord {
  return {
    ...accountState,
    wallet: {
      ...wallet,
    },
  };
}

function walletSnapshot(wallet: WalletState): JsonRecord {
  return {
    gems: wallet.gems,
    cash: wallet.cash,
    fuel: wallet.fuel,
  };
}

function toI32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 2_147_483_647) return 2_147_483_647;
  if (value < -2_147_483_648) return -2_147_483_648;
  return Math.trunc(value);
}

function appendWalletTransaction(
  ctx: any,
  params: {
    userId: string;
    eventType: string;
    delta: WalletDelta;
    balanceBefore: WalletState;
    balanceAfter: WalletState;
    metadata?: JsonRecord;
  },
): void {
  ctx.db.walletTransactionItem.insert({
    id: makeId(ctx, 'wallet-tx'),
    userId: params.userId,
    eventType: params.eventType,
    deltaGems: toI32(params.delta.gems),
    deltaCash: toI32(params.delta.cash),
    deltaFuel: toI32(params.delta.fuel),
    balanceBefore: toJsonString(walletSnapshot(params.balanceBefore)),
    balanceAfter: toJsonString(walletSnapshot(params.balanceAfter)),
    metadata: toJsonString(params.metadata ?? {}),
    createdAt: ctx.timestamp,
  });
}

function hasWalletPurchaseToken(
  ctx: any,
  userId: string,
  purchaseToken: string,
): boolean {
  for (const row of ctx.db.walletTransactionItem.iter()) {
    if (row.userId !== userId || row.eventType !== 'credit_gems_purchase') {
      continue;
    }

    const metadata = parseJsonRecord(row.metadata);
    const existingToken = readString(metadata.purchaseToken);
    if (existingToken && existingToken === purchaseToken) {
      return true;
    }
  }

  return false;
}

function upsertNotificationItem(ctx: any, id: string, userId: string, item: JsonRecord): void {
  const existing = ctx.db.notificationItem.id.find(id);
  if (existing) {
    ctx.db.notificationItem.id.delete(id);
  }

  ctx.db.notificationItem.insert({
    id,
    userId,
    item: toJsonString(item),
    createdAt: ctx.timestamp,
  });
}

function upsertFriendshipItem(
  ctx: any,
  pairKey: string,
  userLowId: string,
  userHighId: string,
  status: 'pending' | 'accepted' | 'declined' | 'blocked',
  requestedBy: string | null,
): void {
  const existing = ctx.db.friendship.pairKey.find(pairKey);
  if (existing) {
    ctx.db.friendship.pairKey.delete(pairKey);
  }

  ctx.db.friendship.insert({
    pairKey,
    userLowId,
    userHighId,
    status,
    requestedBy,
    updatedAt: ctx.timestamp,
  });
}

function readConversationItem(ctx: any, ownerUserId: string, otherUserId: string): JsonRecord {
  const rowId = buildConversationRowId(ownerUserId, otherUserId);
  const row = ctx.db.conversationItem.id.find(rowId);
  if (!row) return {};
  return parseJsonRecord(row.item);
}

function writeConversationItem(
  ctx: any,
  ownerUserId: string,
  otherUserId: string,
  item: JsonRecord,
): void {
  const rowId = buildConversationRowId(ownerUserId, otherUserId);
  const existing = ctx.db.conversationItem.id.find(rowId);
  if (existing) {
    ctx.db.conversationItem.id.delete(rowId);
  }

  ctx.db.conversationItem.insert({
    id: rowId,
    ownerUserId,
    otherUserId,
    item: toJsonString(item),
    updatedAt: ctx.timestamp,
  });
}

function readThreadMessages(ctx: any, ownerUserId: string, otherUserId: string): JsonArray {
  const rowId = buildThreadRowId(ownerUserId, otherUserId);
  const row = ctx.db.threadSeedMessage.id.find(rowId);
  if (!row) return [];
  return parseJsonArray(row.messages);
}

function writeThreadMessages(
  ctx: any,
  ownerUserId: string,
  otherUserId: string,
  messages: JsonArray,
): void {
  const rowId = buildThreadRowId(ownerUserId, otherUserId);
  const existing = ctx.db.threadSeedMessage.id.find(rowId);
  if (existing) {
    ctx.db.threadSeedMessage.id.delete(rowId);
  }

  ctx.db.threadSeedMessage.insert({
    id: rowId,
    ownerUserId,
    otherUserId,
    messages: toJsonString(messages),
    updatedAt: ctx.timestamp,
  });
}

function appendThreadMessage(
  ctx: any,
  ownerUserId: string,
  otherUserId: string,
  message: JsonRecord,
): void {
  const existing = readThreadMessages(ctx, ownerUserId, otherUserId);
  const next = [...existing, message];
  if (next.length > MAX_THREAD_MESSAGES) {
    next.splice(0, next.length - MAX_THREAD_MESSAGES);
  }
  writeThreadMessages(ctx, ownerUserId, otherUserId, next);
}

function readLiveItem(ctx: any, liveId: string): JsonRecord {
  const row = ctx.db.liveItem.id.find(liveId);
  if (!row) return {};
  return parseJsonRecord(row.item);
}

function writeLiveItem(ctx: any, liveId: string, item: JsonRecord): void {
  const existing = ctx.db.liveItem.id.find(liveId);
  if (existing) {
    ctx.db.liveItem.id.delete(liveId);
  }

  ctx.db.liveItem.insert({
    id: liveId,
    item: toJsonString(item),
    updatedAt: ctx.timestamp,
  });

  upsertPublicLiveDiscoveryItem(ctx, liveId, item);
}

function upsertPublicLiveDiscoveryItem(
  ctx: any,
  liveId: string,
  item: JsonRecord,
): void {
  const hosts = normalizeHostList(item.hosts);
  const primaryHost = hosts[0] ?? {};
  const viewerCount = toNonNegativeInt(item.viewers);
  const endedAt = toNonNegativeInt(item.endedAt);
  const shouldHideFromDiscovery = endedAt > 0 || hosts.length === 0;

  const hostUserId =
    readString(primaryHost.id) ??
    readString(item.ownerUserId) ??
    readString(item.hostUserId);
  const profileSummary = readPublicProfileSummaryItem(ctx, hostUserId);
  const profileUsername = readString(profileSummary?.username);
  const profileAvatarUrl = readString(profileSummary?.avatarUrl);

  const hostUsername = resolveFriendlyUserLabel(hostUserId, [
    readString(primaryHost.username),
    readString(primaryHost.name),
    readString(item.hostUsername),
    profileUsername,
  ]);
  const hostAvatarUrl = firstDefinedString([
    readString(primaryHost.avatar),
    readString(item.hostAvatarUrl),
    profileAvatarUrl,
  ]);

  const existing = ctx.db.publicLiveDiscoveryItem.liveId.find(liveId);
  if (existing) {
    ctx.db.publicLiveDiscoveryItem.liveId.delete(liveId);
  }

  if (shouldHideFromDiscovery) {
    return;
  }

  ctx.db.publicLiveDiscoveryItem.insert({
    liveId,
    hostUserId,
    hostUsername,
    hostAvatarUrl,
    title: readString(item.title) ?? 'Live',
    viewerCount,
  });
}

function readLivePresenceItem(ctx: any, userId: string): JsonRecord {
  const row = ctx.db.livePresenceItem.userId.find(userId);
  if (!row) return {};
  return parseJsonRecord(row.item);
}

function upsertPublicLivePresenceItem(
  ctx: any,
  userId: string,
  liveId: string,
  activity: 'hosting' | 'watching',
): void {
  const existing = ctx.db.publicLivePresenceItem.userId.find(userId);
  if (existing) {
    ctx.db.publicLivePresenceItem.userId.delete(userId);
  }

  ctx.db.publicLivePresenceItem.insert({
    userId,
    liveId,
    activity,
    updatedAt: ctx.timestamp,
  });
}

function upsertLivePresenceItem(ctx: any, userId: string, item: JsonRecord): void {
  const liveId = readString(item.liveId);
  const activity = readString(item.activity);
  const normalizedActivity = activity === 'hosting' ? 'hosting' : activity === 'watching' ? 'watching' : null;

  const existing = ctx.db.livePresenceItem.userId.find(userId);
  if (existing) {
    ctx.db.livePresenceItem.userId.delete(userId);
  }

  ctx.db.livePresenceItem.insert({
    userId,
    liveId,
    item: toJsonString(item),
    updatedAt: ctx.timestamp,
  });

  if (liveId && normalizedActivity) {
    upsertPublicLivePresenceItem(ctx, userId, liveId, normalizedActivity);
  }
}

function deleteLivePresenceItem(ctx: any, userId: string): void {
  const existing = ctx.db.livePresenceItem.userId.find(userId);
  if (existing) {
    ctx.db.livePresenceItem.userId.delete(userId);
  }

  const publicRow = ctx.db.publicLivePresenceItem.userId.find(userId);
  if (publicRow) {
    ctx.db.publicLivePresenceItem.userId.delete(userId);
  }
}

function normalizeHost(entry: unknown): JsonRecord | null {
  if (!isRecord(entry)) return null;

  const id = readString(entry.id);
  const name = readString(entry.name) ?? id;
  const avatar = readString(entry.avatar);
  if (!id || !name) return null;

  return {
    id,
    username: readString(entry.username) ?? name,
    name,
    age: toNonNegativeInt(entry.age),
    country: readString(entry.country) ?? '',
    bio: readString(entry.bio) ?? '',
    verified: readBoolean(entry.verified) ?? false,
    avatar: avatar ?? '',
  };
}

function normalizeHostList(value: unknown): JsonRecord[] {
  if (!isArray(value)) return [];

  const result: JsonRecord[] = [];
  value.forEach((entry) => {
    const normalized = normalizeHost(entry);
    if (normalized) result.push(normalized);
  });
  return result;
}

function normalizeBannedUserIds(value: unknown): string[] {
  if (!isArray(value)) return [];

  const result = new Set<string>();
  value.forEach((entry) => {
    const userId = readString(entry);
    if (userId) result.add(userId);
  });
  return Array.from(result);
}

function normalizeInvitedUserIds(value: unknown): string[] {
  if (!isArray(value)) return [];

  const result = new Set<string>();
  value.forEach((entry) => {
    const userId = readString(entry);
    if (userId) result.add(userId);
  });
  return Array.from(result);
}

function updateKnownLiveUsersFromHosts(ctx: any, hosts: JsonRecord[]): void {
  hosts.forEach((host) => {
    const userId = readString(host.id);
    if (!userId) return;

    const profileSummary = readPublicProfileSummaryItem(ctx, userId);
    const profileUsername = readString(profileSummary?.username);
    const profileAvatarUrl = readString(profileSummary?.avatarUrl);

    const existing = ctx.db.knownLiveUserItem.id.find(userId);
    if (existing) {
      ctx.db.knownLiveUserItem.id.delete(userId);
    }

    const username = resolveFriendlyUserLabel(userId, [
      readString(host.username),
      readString(host.name),
      profileUsername,
    ]);
    const name = resolveFriendlyUserLabel(userId, [
      readString(host.name),
      readString(host.username),
      profileUsername,
    ]);
    const avatarUrl = firstDefinedString([
      readString(host.avatar),
      profileAvatarUrl,
    ]) ?? '';

    const item = {
      id: userId,
      username,
      name,
      age: toNonNegativeInt(host.age),
      country: readString(host.country) ?? '',
      bio: readString(host.bio) ?? '',
      verified: readBoolean(host.verified) ?? false,
      avatarUrl,
      updatedAt: nowMs(ctx),
    };

    ctx.db.knownLiveUserItem.insert({
      id: userId,
      item: toJsonString(item),
      updatedAt: ctx.timestamp,
    });
  });
}

function upsertLiveBoostLeaderboardItem(
  ctx: any,
  liveId: string,
  patch: JsonRecord,
): void {
  const existing = ctx.db.liveBoostLeaderboardItem.id.find(liveId);
  const existingItem = existing ? parseJsonRecord(existing.item) : {};
  const next = {
    ...existingItem,
    ...patch,
    id: liveId,
    updatedAt: nowMs(ctx),
  };

  if (existing) {
    ctx.db.liveBoostLeaderboardItem.id.delete(liveId);
  }

  ctx.db.liveBoostLeaderboardItem.insert({
    id: liveId,
    item: toJsonString(next),
    updatedAt: ctx.timestamp,
  });
}

function shouldPersistGlobalEvent(eventType: string | null): boolean {
  if (!eventType) return true;
  if (eventType === 'account_state_upsert') return false;
  if (eventType === 'live_presence') return false;
  return true;
}

function upsertMentionUsersFromText(ctx: any, text: string): void {
  if (!text) return;

  const mentionRegex = /@([a-zA-Z0-9_.-]{2,30})/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1]?.trim();
    if (!username) continue;

    const id = username.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const existing = ctx.db.mentionUserItem.id.find(id);
    if (existing) {
      ctx.db.mentionUserItem.id.delete(id);
    }

    ctx.db.mentionUserItem.insert({
      id,
      item: toJsonString({
        id,
        name: username,
      }),
      updatedAt: ctx.timestamp,
    });
  }
}

function upsertSocialFromProfile(ctx: any, payload: JsonRecord): void {
  const userId = readString(payload.userId);
  if (!userId) return;

  const username = readString(payload.username) ?? readString(payload.displayName) ?? userId;
  const avatarUrl = readString(payload.avatarUrl) ?? '';
  const existingSocial = readSocialUserItem(ctx, userId);
  const incomingStatusText = readString(payload.statusText) ?? readString(payload.statusMessage);
  const statusText =
    incomingStatusText ??
    readString(existingSocial.statusText) ??
    readString(existingSocial.statusMessage) ??
    '';
  const status = resolveSocialPresenceStatus(
    [
      {
        status: payload.status,
        presenceStatus: payload.presenceStatus,
        accountStatus: payload.accountStatus,
        isLive: payload.isLive,
        isOnline: payload.isOnline,
      },
      {
        status: existingSocial.status,
        presenceStatus: existingSocial.presenceStatus,
        accountStatus: existingSocial.accountStatus,
        isLive: existingSocial.isLive,
        isOnline: existingSocial.isOnline,
      },
    ],
    'offline',
  );
  const lastSeen =
    readString(payload.lastSeen) ??
    (status === 'offline' || status === 'recent'
      ? readString(existingSocial.lastSeen) ?? toIsoString(nowMs(ctx))
      : readString(existingSocial.lastSeen) ?? '');

  const existingProfile = readUserProfileItem(ctx, userId);
  const nextProfile = {
    ...existingProfile,
    ...payload,
    userId,
    username,
    displayName: readString(payload.displayName) ?? username,
    avatarUrl,
    statusText,
    statusMessage:
      readString(payload.statusMessage) ?? readString(existingProfile.statusMessage) ?? statusText,
    updatedAt: nowMs(ctx),
  };
  writeUserProfileItem(ctx, userId, nextProfile);

  const nextSocial = {
    ...existingSocial,
    userId,
    username,
    avatarUrl,
    status,
    statusText,
    statusMessage: statusText,
    isLive: status === 'live',
    isOnline: socialPresenceIsOnline(status),
    lastSeen,
    updatedAt: nowMs(ctx),
  };
  writeSocialUserItem(ctx, userId, nextSocial);
}

function applySocialStatus(ctx: any, payload: JsonRecord): void {
  const userId = readString(payload.userId);
  if (!userId) return;

  const existing = readSocialUserItem(ctx, userId);
  const status = resolveSocialPresenceStatus(
    [
      {
        status: payload.status,
        presenceStatus: payload.presenceStatus,
        accountStatus: payload.accountStatus,
        isLive: payload.isLive,
        isOnline: payload.isOnline,
      },
      {
        status: existing.status,
        presenceStatus: existing.presenceStatus,
        accountStatus: existing.accountStatus,
        isLive: existing.isLive,
        isOnline: existing.isOnline,
      },
    ],
    'offline',
  );
  const statusText =
    readString(payload.statusText) ??
    readString(payload.statusMessage) ??
    readString(existing.statusText) ??
    readString(existing.statusMessage) ??
    '';

  const next = {
    ...existing,
    userId,
    username: readString(payload.username) ?? existing.username ?? userId,
    avatarUrl: readString(payload.avatarUrl) ?? existing.avatarUrl ?? '',
    status,
    statusText,
    statusMessage: statusText,
    isLive: status === 'live',
    isOnline: socialPresenceIsOnline(status),
    lastSeen:
      readString(payload.lastSeen) ??
      (status === 'recent' || status === 'offline'
        ? toIsoString(nowMs(ctx))
        : readString(existing.lastSeen) ?? ''),
    updatedAt: nowMs(ctx),
  };

  writeSocialUserItem(ctx, userId, next);
  refreshPublicProfileSummaryItem(ctx, userId);
}

function applyAccountStateUpsert(ctx: any, payload: JsonRecord): void {
  const userId = readString(payload.userId);
  const updates = isRecord(payload.updates) ? payload.updates : {};
  if (!userId) return;

  if (Object.prototype.hasOwnProperty.call(updates, 'wallet')) {
    throw new Error('wallet updates must use dedicated wallet reducers.');
  }

  const currentState = readAccountStateItem(ctx, userId);
  const nextState = deepMerge(currentState, updates);
  writeAccountStateItem(ctx, userId, nextState);
}

function applyThreadMessage(ctx: any, payload: JsonRecord): void {
  const fromUserId = readString(payload.fromUserId);
  const toUserId = readString(payload.toUserId);
  if (!fromUserId || !toUserId) return;

  const now = nowMs(ctx);
  const messageRaw = isRecord(payload.message) ? payload.message : {};
  const text = readString(messageRaw.text) ?? '';
  if (text.length === 0 && !readString(messageRaw.audioUrl)) return;

  const messageId = readString(messageRaw.id) ?? makeId(ctx, 'thread');
  const createdAt = toNonNegativeInt(messageRaw.createdAt, now);
  const senderId = readString(messageRaw.senderId) ?? fromUserId;
  const conversationKey =
    readString(payload.conversationKey) ?? buildConversationKey(fromUserId, toUserId);

  const message: JsonRecord = {
    ...messageRaw,
    id: messageId,
    user: readString(messageRaw.user) ?? fromUserId,
    senderId,
    text,
    createdAt,
    deliveredAt: toNonNegativeInt(messageRaw.deliveredAt, createdAt),
    readAt: readNumber(messageRaw.readAt) ?? null,
    type: readString(messageRaw.type) ?? 'user',
    amount: toNonNegativeInt(messageRaw.amount),
    audioUrl: readString(messageRaw.audioUrl) ?? undefined,
    duration: toNonNegativeInt(messageRaw.duration),
  };

  appendThreadMessage(ctx, fromUserId, toUserId, message);
  appendThreadMessage(ctx, toUserId, fromUserId, message);

  const senderConversation = readConversationItem(ctx, fromUserId, toUserId);
  writeConversationItem(ctx, fromUserId, toUserId, {
    ...senderConversation,
    id: buildConversationRowId(fromUserId, toUserId),
    otherUserId: toUserId,
    unreadCount: toNonNegativeInt(senderConversation.unreadCount),
    lastMessage: {
      id: messageId,
      senderId: fromUserId,
      text,
      createdAt: toIsoString(createdAt),
      deliveredAt: createdAt,
      readAt: readNumber(message.readAt) ?? null,
    },
    updatedAt: now,
  });

  const recipientConversation = readConversationItem(ctx, toUserId, fromUserId);
  writeConversationItem(ctx, toUserId, fromUserId, {
    ...recipientConversation,
    id: buildConversationRowId(toUserId, fromUserId),
    otherUserId: fromUserId,
    unreadCount: toNonNegativeInt(recipientConversation.unreadCount) + 1,
    lastMessage: {
      id: messageId,
      senderId: fromUserId,
      text,
      createdAt: toIsoString(createdAt),
      deliveredAt: createdAt,
      readAt: readNumber(message.readAt) ?? null,
    },
    updatedAt: now,
  });

  upsertMentionUsersFromText(ctx, text);

  const existingRecipientProfile = readUserProfileItem(ctx, toUserId);
  if (Object.keys(existingRecipientProfile).length > 0) {
    const notificationId = makeId(ctx, 'notif-thread');
    upsertNotificationItem(ctx, notificationId, toUserId, {
      id: notificationId,
      type: 'activity',
      activityType: 'reply',
      createdAt: now,
      read: false,
      fromUser: {
        id: fromUserId,
        name: readString(message.user) ?? fromUserId,
      },
      message: text,
      metadata: {
        conversationKey,
        messageId,
      },
    });
  }
}

function applyConversationRead(ctx: any, payload: JsonRecord): void {
  const readerUserId = readString(payload.readerUserId);
  const otherUserId = readString(payload.otherUserId);
  if (!readerUserId || !otherUserId) return;

  const readAt = toNonNegativeInt(payload.readAt, nowMs(ctx));

  const conversation = readConversationItem(ctx, readerUserId, otherUserId);
  const lastMessage = isRecord(conversation.lastMessage) ? conversation.lastMessage : {};
  writeConversationItem(ctx, readerUserId, otherUserId, {
    ...conversation,
    id: buildConversationRowId(readerUserId, otherUserId),
    otherUserId,
    unreadCount: 0,
    lastMessage: {
      ...lastMessage,
      readAt,
    },
    updatedAt: nowMs(ctx),
  });

  const threadMessages = readThreadMessages(ctx, readerUserId, otherUserId);
  const nextMessages = threadMessages.map((entry) => {
    if (!isRecord(entry)) return entry;
    const senderId = readString(entry.senderId);
    if (senderId !== otherUserId) return entry;
    const currentReadAt = readNumber(entry.readAt);
    if (currentReadAt !== null && currentReadAt >= readAt) return entry;
    return {
      ...entry,
      readAt,
    };
  });
  writeThreadMessages(ctx, readerUserId, otherUserId, nextMessages);
}

function applyFriendRequest(ctx: any, payload: JsonRecord): void {
  const fromUserId = readString(payload.fromUserId);
  const toUserId = readString(payload.toUserId);
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const pairKey = readString(payload.pairKey) ?? buildPairKey(fromUserId, toUserId);
  const users = pairKey.split('::');
  if (users.length !== 2) return;

  const requestId = readString(payload.requestId) ?? makeId(ctx, 'friend-request');
  upsertFriendshipItem(ctx, pairKey, users[0]!, users[1]!, 'pending', fromUserId);

  const notificationId = `notif-${requestId}`;
  upsertNotificationItem(ctx, notificationId, toUserId, {
    id: notificationId,
    type: 'friend_request',
    createdAt: nowMs(ctx),
    read: false,
    status: 'pending',
    direction: 'received',
    fromUser: {
      id: fromUserId,
      name: readString(payload.fromUserName) ?? fromUserId,
      avatar: readString(payload.fromUserAvatar) ?? '',
      level: 0,
    },
    metadata: {
      requestId,
      pairKey,
    },
  });
}

function applyFriendResponse(ctx: any, payload: JsonRecord): void {
  const fromUserId = readString(payload.fromUserId);
  const toUserId = readString(payload.toUserId);
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const pairKey = readString(payload.pairKey) ?? buildPairKey(fromUserId, toUserId);
  const users = pairKey.split('::');
  if (users.length !== 2) return;

  const statusRaw = readString(payload.status);
  const status: 'accepted' | 'declined' = statusRaw === 'accepted' ? 'accepted' : 'declined';

  upsertFriendshipItem(ctx, pairKey, users[0]!, users[1]!, status, fromUserId);

  const notificationId = makeId(ctx, 'notif-friend-response');
  upsertNotificationItem(ctx, notificationId, toUserId, {
    id: notificationId,
    type: 'activity',
    activityType: 'other',
    createdAt: nowMs(ctx),
    read: false,
    fromUser: {
      id: fromUserId,
      name: readString(payload.fromUserName) ?? fromUserId,
      avatar: readString(payload.fromUserAvatar) ?? '',
    },
    message:
      status === 'accepted'
        ? `${readString(payload.fromUserName) ?? fromUserId} accepted your friend request.`
        : `${readString(payload.fromUserName) ?? fromUserId} declined your friend request.`,
    metadata: {
      pairKey,
      status,
    },
  });
}

function applyFriendRemoved(ctx: any, payload: JsonRecord): void {
  const fromUserId = readString(payload.fromUserId);
  const toUserId = readString(payload.toUserId);
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const pairKey = readString(payload.pairKey) ?? buildPairKey(fromUserId, toUserId);
  const users = pairKey.split('::');
  if (users.length !== 2) return;

  upsertFriendshipItem(ctx, pairKey, users[0]!, users[1]!, 'blocked', fromUserId);

  const notificationId = makeId(ctx, 'notif-friend-removed');
  upsertNotificationItem(ctx, notificationId, toUserId, {
    id: notificationId,
    type: 'activity',
    activityType: 'other',
    createdAt: nowMs(ctx),
    read: false,
    fromUser: {
      id: fromUserId,
      name: readString(payload.fromUserName) ?? fromUserId,
      avatar: readString(payload.fromUserAvatar) ?? '',
    },
    message: `${readString(payload.fromUserName) ?? fromUserId} removed the friend connection.`,
    metadata: {
      pairKey,
    },
  });
}

function applyLiveStart(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  if (!liveId) return;

  const ownerUserId =
    readString(payload.ownerUserId) ?? readString(payload.hostUserId) ?? readString(payload.fromUserId);
  const title = readString(payload.title) ?? 'Live';
  const inviteOnly = readBoolean(payload.inviteOnly) ?? false;
  const now = nowMs(ctx);
  const hosts = normalizeHostList(payload.hosts);
  const bannedUserIds = normalizeBannedUserIds(payload.bannedUserIds);
  const invitedUserIds = normalizeInvitedUserIds(payload.invitedUserIds);

  const nextLiveItem: JsonRecord = {
    id: liveId,
    title,
    viewers: Math.max(1, toNonNegativeInt(payload.viewers, hosts.length > 0 ? hosts.length : 1)),
    inviteOnly,
    ownerUserId: ownerUserId ?? (hosts[0] ? readString(hosts[0].id) : null),
    hosts,
    images: hosts.map((host) => readString(host.avatar)).filter((value): value is string => Boolean(value)),
    bannedUserIds,
    invitedUserIds,
    boosted: false,
    totalBoosts: 0,
    boostRank: null,
    createdAt: now,
    updatedAt: now,
    event: {
      enabled: true,
      drawIntervalMinutes: 15,
      durationHours: 24,
      startedAt: now,
      endsAt: now + LIVE_EVENT_DURATION_MS,
      lastWinnerAt: 0,
      winners: [] as JsonArray,
    },
  };

  writeLiveItem(ctx, liveId, nextLiveItem);
  updateKnownLiveUsersFromHosts(ctx, hosts);

  if (ownerUserId) {
    upsertLivePresenceItem(ctx, ownerUserId, {
      userId: ownerUserId,
      activity: 'hosting',
      liveId,
      liveTitle: title,
      updatedAt: now,
    });
  }

  upsertLiveBoostLeaderboardItem(ctx, liveId, {
    id: liveId,
    title,
    boostCount: 0,
    rank: 0,
    hostAvatars: nextLiveItem.images,
    isYourLive: false,
  });
}

function applyLiveUpdate(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  if (!liveId) return;

  const existing = readLiveItem(ctx, liveId);
  if (Object.keys(existing).length === 0) {
    return;
  }

  const hosts =
    payload.hosts !== undefined
      ? normalizeHostList(payload.hosts)
      : normalizeHostList(existing.hosts);

  const next: JsonRecord = {
    ...existing,
    title: readString(payload.title) ?? readString(existing.title) ?? 'Live',
    inviteOnly: readBoolean(payload.inviteOnly) ?? readBoolean(existing.inviteOnly) ?? false,
    viewers:
      payload.viewers !== undefined
        ? Math.max(0, toNonNegativeInt(payload.viewers))
        : Math.max(0, toNonNegativeInt(existing.viewers)),
    hosts,
    images: hosts
      .map((host) => readString(host.avatar))
      .filter((value): value is string => Boolean(value)),
    bannedUserIds:
      payload.bannedUserIds !== undefined
        ? normalizeBannedUserIds(payload.bannedUserIds)
        : normalizeBannedUserIds(existing.bannedUserIds),
    invitedUserIds:
      payload.invitedUserIds !== undefined
        ? normalizeInvitedUserIds(payload.invitedUserIds)
        : normalizeInvitedUserIds(existing.invitedUserIds),
    updatedAt: nowMs(ctx),
  };

  writeLiveItem(ctx, liveId, next);
  updateKnownLiveUsersFromHosts(ctx, hosts);
  upsertLiveBoostLeaderboardItem(ctx, liveId, {
    title: readString(next.title) ?? 'Live',
    hostAvatars: next.images,
  });
}

function applyLivePresence(ctx: any, payload: JsonRecord): void {
  const userId = readString(payload.userId);
  const activity = readString(payload.activity);
  if (!userId || !activity) return;

  if (activity === 'none') {
    const previousPresence = readLivePresenceItem(ctx, userId);
    const previousLiveId = readString(previousPresence.liveId);
    const previousActivity = readString(previousPresence.activity);
    deleteLivePresenceItem(ctx, userId);

    if (previousLiveId && previousActivity === 'hosting') {
      const live = readLiveItem(ctx, previousLiveId);
      if (Object.keys(live).length > 0) {
        const hosts = normalizeHostList(live.hosts);
        const remainingHosts = hosts.filter((host) => readString(host.id) !== userId);
        const ownerUserId = readLiveOwnerUserId(live);
        const shouldEndLive = ownerUserId === userId || remainingHosts.length === 0;

        if (shouldEndLive) {
          applyLiveEnd(ctx, { liveId: previousLiveId });
        } else if (remainingHosts.length !== hosts.length) {
          writeLiveItem(ctx, previousLiveId, {
            ...live,
            hosts: remainingHosts,
            images: remainingHosts
              .map((host) => readString(host.avatar))
              .filter((value): value is string => Boolean(value)),
            viewers: Math.max(0, toNonNegativeInt(live.viewers) - 1),
            updatedAt: nowMs(ctx),
          });
        }
      }
    }
    return;
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    deleteLivePresenceItem(ctx, userId);
    return;
  }

  upsertLivePresenceItem(ctx, userId, {
    userId,
    activity: activity === 'hosting' ? 'hosting' : 'watching',
    liveId,
    liveTitle: readString(payload.liveTitle) ?? '',
    updatedAt: nowMs(ctx),
  });
}

function applyLiveInvite(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
  invitedUserIds.add(targetUserId);

  writeLiveItem(ctx, liveId, {
    ...live,
    invitedUserIds: Array.from(invitedUserIds),
    updatedAt: nowMs(ctx),
  });
}

function applyLiveHostRequest(_ctx: any, _payload: JsonRecord): void {
  // Request state is derived from global events on clients.
}

function applyLiveHostRequestResponse(_ctx: any, _payload: JsonRecord): void {
  // Request state is derived from global events on clients.
}

function applyLiveInviteResponse(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  const accepted = readBooleanLike(payload.accepted) ?? false;
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0 || isLiveEnded(live)) return;

  const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
  invitedUserIds.add(targetUserId);

  const hosts = normalizeHostList(live.hosts);
  const hostExists = hosts.some((host) => readString(host.id) === targetUserId);
  if (accepted && !hostExists) {
    const profileSummary = readPublicProfileSummaryItem(ctx, targetUserId);
    const username = resolveFriendlyUserLabel(targetUserId, [
      readString(profileSummary?.username),
      targetUserId,
    ]);
    const host: JsonRecord = {
      id: targetUserId,
      username,
      name: resolveFriendlyUserLabel(targetUserId, [
        readString(profileSummary?.username),
        username,
      ]),
      age: 0,
      country: '',
      bio: '',
      verified: false,
      avatar: readString(profileSummary?.avatarUrl) ?? '',
    };
    hosts.push(host);
  }

  const nextLiveItem: JsonRecord = {
    ...live,
    hosts,
    images: hosts
      .map((host) => readString(host.avatar))
      .filter((value): value is string => Boolean(value)),
    viewers: Math.max(toNonNegativeInt(live.viewers), hosts.length),
    invitedUserIds: Array.from(invitedUserIds),
    updatedAt: nowMs(ctx),
  };

  writeLiveItem(ctx, liveId, nextLiveItem);
  updateKnownLiveUsersFromHosts(ctx, hosts);
}

function applyLiveBan(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const bannedUserIds = new Set(normalizeBannedUserIds(live.bannedUserIds));
  bannedUserIds.add(targetUserId);

  const hosts = normalizeHostList(live.hosts).filter((host) => readString(host.id) !== targetUserId);

  writeLiveItem(ctx, liveId, {
    ...live,
    hosts,
    images: hosts.map((host) => readString(host.avatar)).filter((value): value is string => Boolean(value)),
    bannedUserIds: Array.from(bannedUserIds),
    viewers: Math.max(0, toNonNegativeInt(live.viewers) - 1),
    updatedAt: nowMs(ctx),
  });

  const presence = readLivePresenceItem(ctx, targetUserId);
  if (readString(presence.liveId) === liveId) {
    deleteLivePresenceItem(ctx, targetUserId);
  }
}

function applyLiveUnban(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const bannedUserIds = normalizeBannedUserIds(live.bannedUserIds).filter((id) => id !== targetUserId);

  writeLiveItem(ctx, liveId, {
    ...live,
    bannedUserIds,
    updatedAt: nowMs(ctx),
  });
}

function applyLiveEnd(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  if (!liveId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  writeLiveItem(ctx, liveId, {
    ...live,
    hosts: [],
    images: [],
    viewers: 0,
    endedAt: nowMs(ctx),
    updatedAt: nowMs(ctx),
  });

  for (const row of ctx.db.livePresenceItem.iter()) {
    const item = parseJsonRecord(row.item);
    if (readString(item.liveId) === liveId) {
      deleteLivePresenceItem(ctx, row.userId);
    }
  }

  const boostRow = ctx.db.liveBoostLeaderboardItem.id.find(liveId);
  if (boostRow) {
    ctx.db.liveBoostLeaderboardItem.id.delete(liveId);
  }
}

function applyLiveBoost(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  if (!liveId) return;

  const amount = Math.max(1, toNonNegativeInt(payload.amount, 1));
  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const currentBoosts = toNonNegativeInt(live.totalBoosts);
  const nextBoosts = currentBoosts + amount;

  const nextLive: JsonRecord = {
    ...live,
    boosted: true,
    totalBoosts: nextBoosts,
    updatedAt: nowMs(ctx),
  };
  writeLiveItem(ctx, liveId, nextLive);

  const existingBoostRow = ctx.db.liveBoostLeaderboardItem.id.find(liveId);
  const existingBoost = existingBoostRow ? parseJsonRecord(existingBoostRow.item) : {};

  upsertLiveBoostLeaderboardItem(ctx, liveId, {
    id: liveId,
    title: readString(nextLive.title) ?? 'Live',
    boostCount: toNonNegativeInt(existingBoost.boostCount) + amount,
    rank: 0,
    hostAvatars: isArray(nextLive.images) ? nextLive.images : [],
    isYourLive: false,
  });
}

function applyLiveEventTick(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  if (!liveId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const event = isRecord(live.event) ? live.event : {};
  const enabled = readBoolean(event.enabled) ?? true;
  if (!enabled) return;

  const now = nowMs(ctx);
  const startedAt = toNonNegativeInt(event.startedAt, now);
  const endsAt = toNonNegativeInt(event.endsAt, startedAt + LIVE_EVENT_DURATION_MS);
  const lastWinnerAt = toNonNegativeInt(event.lastWinnerAt);
  const intervalMinutes = Math.max(
    1,
    toNonNegativeInt(event.drawIntervalMinutes, LIVE_EVENT_WINNER_INTERVAL_MS / 60_000),
  );
  const intervalMs = intervalMinutes * 60_000;

  if (now > endsAt) {
    writeLiveItem(ctx, liveId, {
      ...live,
      event: {
        ...event,
        endedAt: now,
      },
      updatedAt: now,
    });
    return;
  }

  if (now - lastWinnerAt < intervalMs) {
    return;
  }

  const candidateIds = new Set<string>();
  normalizeHostList(live.hosts).forEach((host) => {
    const userId = readString(host.id);
    if (userId) candidateIds.add(userId);
  });
  for (const row of ctx.db.livePresenceItem.iter()) {
    const item = parseJsonRecord(row.item);
    if (readString(item.liveId) !== liveId) continue;
    const userId = readString(item.userId) ?? row.userId;
    if (userId) candidateIds.add(userId);
  }

  if (candidateIds.size === 0) {
    writeLiveItem(ctx, liveId, {
      ...live,
      event: {
        ...event,
        lastWinnerAt: now,
      },
      updatedAt: now,
    });
    return;
  }

  const candidates = Array.from(candidateIds);
  const winner = candidates[Math.floor(ctx.random() * candidates.length)] ?? candidates[0]!;
  const winners = isArray(event.winners) ? [...event.winners] : [];
  winners.push({ userId: winner, pickedAt: now });

  writeLiveItem(ctx, liveId, {
    ...live,
    event: {
      ...event,
      startedAt,
      endsAt,
      drawIntervalMinutes: intervalMinutes,
      lastWinnerAt: now,
      winners,
    },
    updatedAt: now,
  });

  const winnerNotificationId = makeId(ctx, 'notif-event-winner');
  upsertNotificationItem(ctx, winnerNotificationId, winner, {
    id: winnerNotificationId,
    type: 'activity',
    activityType: 'event',
    createdAt: now,
    read: false,
    message: `You won the event draw in ${readString(live.title) ?? 'the live'}!`,
    metadata: {
      liveId,
      pickedAt: now,
    },
  });

  const eventMessageId = makeId(ctx, 'event-winner');
  const eventMessagePayload = {
    eventType: 'event_winner',
    liveId,
    winnerUserId: winner,
    text: `${winner} won the event draw!`,
    createdAt: now,
  };

  upsertGlobalMessageRow(ctx, eventMessageId, liveId, toJsonString(eventMessagePayload));
}

function applyCashTransfer(ctx: any, payload: JsonRecord): void {
  const fromUserId = readString(payload.fromUserId);
  const toUserId = readString(payload.toUserId);
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const amountCash = Math.max(0, toNonNegativeInt(payload.amountCash));
  if (amountCash <= 0) return;

  const senderState = readAccountStateItem(ctx, fromUserId);
  const receiverState = readAccountStateItem(ctx, toUserId);

  const senderWallet = readWalletFromAccountState(senderState);
  if (senderWallet.cash < amountCash) {
    const insufficientId = makeId(ctx, 'notif-cash-failed');
    upsertNotificationItem(ctx, insufficientId, fromUserId, {
      id: insufficientId,
      type: 'activity',
      activityType: 'other',
      createdAt: nowMs(ctx),
      read: false,
      message: 'Cash transfer failed due to insufficient balance.',
      metadata: {
        attemptedAmountCash: amountCash,
        toUserId,
      },
    });
    return;
  }

  const receiverWallet = readWalletFromAccountState(receiverState);

  const nextSenderWallet = {
    ...senderWallet,
    cash: senderWallet.cash - amountCash,
  };
  const nextReceiverWallet = {
    ...receiverWallet,
    cash: receiverWallet.cash + amountCash,
  };

  writeAccountStateItem(ctx, fromUserId, writeWalletToAccountState(senderState, nextSenderWallet));
  writeAccountStateItem(ctx, toUserId, writeWalletToAccountState(receiverState, nextReceiverWallet));

  const transferId = readString(payload.transferId) ?? makeId(ctx, 'cash-transfer');
  appendWalletTransaction(ctx, {
    userId: fromUserId,
    eventType: 'cash_transfer_sent',
    delta: {
      gems: 0,
      cash: -amountCash,
      fuel: 0,
    },
    balanceBefore: senderWallet,
    balanceAfter: nextSenderWallet,
    metadata: {
      transferId,
      counterpartyUserId: toUserId,
      source: 'sendCashToUser',
    },
  });
  appendWalletTransaction(ctx, {
    userId: toUserId,
    eventType: 'cash_transfer_received',
    delta: {
      gems: 0,
      cash: amountCash,
      fuel: 0,
    },
    balanceBefore: receiverWallet,
    balanceAfter: nextReceiverWallet,
    metadata: {
      transferId,
      counterpartyUserId: fromUserId,
      source: 'sendCashToUser',
    },
  });

  const transferNotificationId = makeId(ctx, 'notif-cash-received');
  upsertNotificationItem(ctx, transferNotificationId, toUserId, {
    id: transferNotificationId,
    type: 'activity',
    activityType: 'money_received',
    createdAt: nowMs(ctx),
    read: false,
    fromUser: {
      id: fromUserId,
      name: readString(payload.fromUserName) ?? fromUserId,
      avatar: readString(payload.fromUserAvatar) ?? '',
    },
    message: `You received ${amountCash} cash.`,
    metadata: {
      amountCash,
      fromUserId,
    },
  });

  const threadMessageId = readString(payload.messageId) ?? makeId(ctx, 'cash-message');
  const conversationKey = buildConversationKey(fromUserId, toUserId);
  const cashMessagePayload: JsonRecord = {
    eventType: 'thread_message',
    conversationKey,
    fromUserId,
    toUserId,
    message: {
      id: threadMessageId,
      user: readString(payload.fromUserName) ?? fromUserId,
      senderId: fromUserId,
      text: readString(payload.note) ?? `Sent ${amountCash} cash`,
      createdAt: nowMs(ctx),
      type: 'cash',
      amount: amountCash,
    },
  };

  applyThreadMessage(ctx, cashMessagePayload);
  upsertGlobalMessageRow(
    ctx,
    threadMessageId,
    `dm:${conversationKey}`,
    toJsonString(cashMessagePayload),
  );
}

function applyDomainEvent(
  ctx: any,
  eventType: string,
  payload: JsonRecord,
): void {
  if (eventType === 'user_profile') {
    upsertSocialFromProfile(ctx, payload);
    return;
  }

  if (eventType === 'social_status') {
    applySocialStatus(ctx, payload);
    return;
  }

  if (eventType === 'account_state_upsert') {
    applyAccountStateUpsert(ctx, payload);
    return;
  }

  if (eventType === 'thread_message') {
    applyThreadMessage(ctx, payload);
    return;
  }

  if (eventType === 'conversation_read') {
    applyConversationRead(ctx, payload);
    return;
  }

  if (eventType === 'friend_request') {
    applyFriendRequest(ctx, payload);
    return;
  }

  if (eventType === 'friend_response') {
    applyFriendResponse(ctx, payload);
    return;
  }

  if (eventType === 'friend_removed') {
    applyFriendRemoved(ctx, payload);
    return;
  }

  if (eventType === 'live_start') {
    applyLiveStart(ctx, payload);
    return;
  }

  if (eventType === 'live_update') {
    applyLiveUpdate(ctx, payload);
    return;
  }

  if (eventType === 'live_presence') {
    applyLivePresence(ctx, payload);
    return;
  }

  if (eventType === 'live_invite') {
    applyLiveInvite(ctx, payload);
    return;
  }

  if (eventType === 'live_host_request') {
    applyLiveHostRequest(ctx, payload);
    return;
  }

  if (eventType === 'live_host_request_response') {
    applyLiveHostRequestResponse(ctx, payload);
    return;
  }

  if (eventType === 'live_invite_response') {
    applyLiveInviteResponse(ctx, payload);
    return;
  }

  if (eventType === 'live_ban') {
    applyLiveBan(ctx, payload);
    return;
  }

  if (eventType === 'live_unban') {
    applyLiveUnban(ctx, payload);
    return;
  }

  if (eventType === 'live_end') {
    applyLiveEnd(ctx, payload);
    return;
  }

  if (eventType === 'live_boost') {
    applyLiveBoost(ctx, payload);
    return;
  }

  if (eventType === 'live_event_tick') {
    applyLiveEventTick(ctx, payload);
    return;
  }

  if (eventType === 'cash_transfer') {
    applyCashTransfer(ctx, payload);
    return;
  }

  if (eventType === 'global_chat_message') {
    const text = readString(payload.text) ?? '';
    if (text.length > 0) {
      upsertMentionUsersFromText(ctx, text);
    }
  }
}

function routeGlobalMessage(
  ctx: any,
  id: string,
  roomId: string,
  rawItem: string,
): void {
  const payload = parseJsonRecord(rawItem);
  const eventType = authorizeGlobalMessagePayload(ctx, roomId, payload);

  if (shouldPersistGlobalEvent(eventType)) {
    const serializedPayload = eventType ? toJsonString(payload) : rawItem;
    upsertGlobalMessageRow(ctx, id, roomId, serializedPayload);
  }

  if (eventType) {
    applyDomainEvent(ctx, eventType, payload);
  }
}

export const resolveOrCreateUserIdentity = schemaDb.reducer(
  {
    provider: t.string(),
    issuer: t.string(),
    subject: t.string(),
    email: t.option(t.string()),
    emailVerified: t.bool(),
  },
  (ctx, args) => {
    resolveOrCreateUserIdentityCore(ctx, args, 'reducer');
  },
);

export const resolveOrCreateUserIdentitySync = schemaDb.procedure(
  { name: 'resolve_or_create_user_identity_sync' },
  {
    provider: t.string(),
    issuer: t.string(),
    subject: t.string(),
    email: t.option(t.string()),
    emailVerified: t.bool(),
  },
  t.string(),
  (ctx, args) =>
    ctx.withTx((tx) => resolveOrCreateUserIdentityCore(tx, args, 'procedure')),
);

export const linkIdentityToExistingUser = schemaDb.reducer(
  {
    currentVuluUserId: t.string(),
    provider: t.string(),
    issuer: t.string(),
    subject: t.string(),
    email: t.option(t.string()),
    emailVerified: t.bool(),
  },
  (ctx, args) => {
    const callerUserId = assertSelf(ctx, args.currentVuluUserId, 'currentVuluUserId');
    const provider = readString(args.provider)?.toLowerCase();
    const issuer = readString(args.issuer);
    const subject = readString(args.subject);
    const email = readString(args.email);

    if (!provider || !issuer || !subject) {
      throw new Error('provider, issuer, and subject are required.');
    }

    if (!readUserRow(ctx, callerUserId)) {
      unauthorized('currentVuluUserId does not exist.');
    }

    // Stub reducer: only the currently authenticated identity may be linked here.
    // Future providers can extend this once proof-of-ownership flows exist.
    assertIdentityMatchesCallerAuth(ctx, provider, issuer, subject);

    const existingIdentity = findUserIdentity(ctx, provider, issuer, subject);
    if (existingIdentity) {
      const existingVuluUserId = readString(existingIdentity.vuluUserId);
      if (existingVuluUserId && existingVuluUserId !== callerUserId) {
        unauthorized('identity is already linked to a different vulu_user_id.');
      }
      return;
    }

    ctx.db.userIdentity.insert({
      id: makeUuid(ctx),
      vuluUserId: callerUserId,
      provider,
      issuer,
      subject,
      email: email ?? undefined,
      emailVerified: readBoolean(args.emailVerified) === true,
      lookupKey: buildIdentityLookupKey(provider, issuer, subject),
      createdAt: ctx.timestamp,
    });
  },
);

export const setUserRole = schemaDb.reducer(
  {
    targetUserId: t.string(),
    role: t.string(),
    enabled: t.bool(),
  },
  (ctx, args) => {
    const targetUserId =
      readNormalizedStringArg(args.targetUserId) ??
      readNormalizedStringArg((args as JsonRecord).target_user_id);
    const role = readNormalizedStringArg(args.role);
    const enabled = readBooleanLike(args.enabled) !== false;

    if (!targetUserId || !role) {
      throw new Error('targetUserId and role are required.');
    }

    const normalizedRole = role.toLowerCase();
    const canBootstrapFirstAdmin =
      targetUserId === BOOTSTRAP_ADMIN_USER_ID &&
      normalizedRole === 'admin' &&
      enabled &&
      countEnabledAdminRoles(ctx) === 0;

    if (canBootstrapFirstAdmin) {
      if (!readUserRow(ctx, targetUserId)) {
        throw new Error(`Unknown vulu_user_id "${targetUserId}".`);
      }
      const bootstrapActorUserId = resolveCallerUserId(ctx);
      upsertUserRole(ctx, targetUserId, role, enabled, bootstrapActorUserId);
      appendBootstrapAdminGrantAuditLog(ctx, bootstrapActorUserId, targetUserId);
      return;
    }

    const adminUserId = assertAdmin(ctx);

    if (!readUserRow(ctx, targetUserId)) {
      throw new Error(`Unknown vulu_user_id "${targetUserId}".`);
    }

    upsertUserRole(ctx, targetUserId, role, enabled, adminUserId);
  },
);

export const createUserProfile = schemaDb.reducer(
  {
    userId: t.string(),
    profile: t.string(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const profile = parseJsonRecord(args.profile);
    const profileUserId = readString(profile.userId);
    if (profileUserId && profileUserId !== args.userId) {
      unauthorized('profile.userId must match userId.');
    }
    const payload: JsonRecord = {
      ...profile,
      userId: args.userId,
      eventType: 'user_profile',
      createdAt: nowMs(ctx),
    };
    upsertSocialFromProfile(ctx, payload);
  },
);

export const upsertAccountState = schemaDb.reducer(
  {
    userId: t.string(),
    updates: t.string(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    applyAccountStateUpsert(ctx, {
      eventType: 'account_state_upsert',
      userId: args.userId,
      updates: parseJsonRecord(args.updates),
      createdAt: nowMs(ctx),
    });
  },
);

export const sendThreadMessage = schemaDb.reducer(
  {
    id: t.string(),
    conversationKey: t.option(t.string()),
    fromUserId: t.string(),
    toUserId: t.string(),
    message: t.string(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.fromUserId, 'fromUserId');
    const expectedConversationKey = buildConversationKey(args.fromUserId, args.toUserId);
    const conversationKey = readString(args.conversationKey) ?? expectedConversationKey;
    if (conversationKey !== expectedConversationKey) {
      unauthorized('conversationKey must match fromUserId/toUserId.');
    }

    const message = parseJsonRecord(args.message);
    const messageSenderId = readString(message.senderId);
    if (messageSenderId && messageSenderId !== args.fromUserId) {
      unauthorized('message.senderId must match fromUserId.');
    }

    const payload: JsonRecord = {
      eventType: 'thread_message',
      conversationKey,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      message,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `dm:${payload.conversationKey as string}`, toJsonString(payload));
    applyThreadMessage(ctx, payload);
  },
);

export const markConversationRead = schemaDb.reducer(
  {
    id: t.string(),
    conversationKey: t.option(t.string()),
    readerUserId: t.string(),
    otherUserId: t.string(),
    readAt: t.string(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.readerUserId, 'readerUserId');
    const expectedConversationKey = buildConversationKey(args.readerUserId, args.otherUserId);
    const conversationKey = readString(args.conversationKey) ?? expectedConversationKey;
    if (conversationKey !== expectedConversationKey) {
      unauthorized('conversationKey must match readerUserId/otherUserId.');
    }

    const payload: JsonRecord = {
      eventType: 'conversation_read',
      conversationKey,
      readerUserId: args.readerUserId,
      otherUserId: args.otherUserId,
      readAt: readNumber(args.readAt) ?? nowMs(ctx),
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `dm:${payload.conversationKey as string}`, toJsonString(payload));
    applyConversationRead(ctx, payload);
  },
);

export const sendFriendRequest = schemaDb.reducer(
  {
    id: t.string(),
    fromUserId: t.string(),
    toUserId: t.string(),
    fromUserName: t.option(t.string()),
    fromUserAvatar: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.fromUserId, 'fromUserId');
    const pairKey = buildPairKey(args.fromUserId, args.toUserId);
    const payload: JsonRecord = {
      eventType: 'friend_request',
      requestId: args.id,
      pairKey,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      fromUserName: readString(args.fromUserName) ?? args.fromUserId,
      fromUserAvatar: readString(args.fromUserAvatar) ?? '',
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `friend:${pairKey}`, toJsonString(payload));
    applyFriendRequest(ctx, payload);
  },
);

export const respondToFriendRequest = schemaDb.reducer(
  {
    id: t.string(),
    requestId: t.string(),
    pairKey: t.string(),
    fromUserId: t.string(),
    toUserId: t.string(),
    status: t.string(),
    fromUserName: t.option(t.string()),
    fromUserAvatar: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.fromUserId, 'fromUserId');
    assertPairMatchesParticipants(args.pairKey, args.fromUserId, args.toUserId);

    const payload: JsonRecord = {
      eventType: 'friend_response',
      requestId: args.requestId,
      pairKey: args.pairKey,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      status: args.status,
      fromUserName: readString(args.fromUserName) ?? args.fromUserId,
      fromUserAvatar: readString(args.fromUserAvatar) ?? '',
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `friend:${args.pairKey}`, toJsonString(payload));
    applyFriendResponse(ctx, payload);
  },
);

export const removeFriendRelationship = schemaDb.reducer(
  {
    id: t.string(),
    pairKey: t.string(),
    fromUserId: t.string(),
    toUserId: t.string(),
    fromUserName: t.option(t.string()),
    fromUserAvatar: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.fromUserId, 'fromUserId');
    assertPairMatchesParticipants(args.pairKey, args.fromUserId, args.toUserId);

    const payload: JsonRecord = {
      eventType: 'friend_removed',
      pairKey: args.pairKey,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      fromUserName: readString(args.fromUserName) ?? args.fromUserId,
      fromUserAvatar: readString(args.fromUserAvatar) ?? '',
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `friend:${args.pairKey}`, toJsonString(payload));
    applyFriendRemoved(ctx, payload);
  },
);

export const setSocialStatus = schemaDb.reducer(
  {
    id: t.string(),
    userId: t.string(),
    status: t.string(),
    statusText: t.option(t.string()),
    lastSeen: t.option(t.string()),
    username: t.option(t.string()),
    avatarUrl: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const normalizedStatus = normalizeSocialPresenceStatus(args.status);
    if (!normalizedStatus) {
      throw new Error('Invalid social status.');
    }
    const payload: JsonRecord = {
      eventType: 'social_status',
      userId: args.userId,
      status: normalizedStatus,
      createdAt: nowMs(ctx),
    };
    const statusText = readString(args.statusText);
    const lastSeen = readString(args.lastSeen);
    const username = readString(args.username);
    const avatarUrl = readString(args.avatarUrl);

    if (statusText !== null) payload.statusText = statusText;
    if (lastSeen !== null) payload.lastSeen = lastSeen;
    if (username !== null) payload.username = username;
    if (avatarUrl !== null) payload.avatarUrl = avatarUrl;

    upsertGlobalMessageRow(ctx, args.id, `social:${args.userId}`, toJsonString(payload));
    applySocialStatus(ctx, payload);
  },
);

export const startLive = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    ownerUserId: t.string(),
    title: t.string(),
    inviteOnly: t.bool(),
    viewers: t.u32(),
    hosts: t.string(),
    bannedUserIds: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.ownerUserId, 'ownerUserId');
    const payload: JsonRecord = {
      eventType: 'live_start',
      liveId: args.liveId,
      ownerUserId: args.ownerUserId,
      title: args.title,
      inviteOnly: args.inviteOnly,
      viewers: args.viewers,
      hosts: parseJsonArray(args.hosts),
      bannedUserIds: parseJsonArray(args.bannedUserIds ?? '[]'),
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveStart(ctx, payload);
  },
);

export const updateLive = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    title: t.option(t.string()),
    inviteOnly: t.option(t.bool()),
    viewers: t.option(t.u32()),
    hosts: t.option(t.string()),
    bannedUserIds: t.option(t.string()),
  },
  (ctx, args) => {
    const existingLive = readLiveItem(ctx, args.liveId);
    if (Object.keys(existingLive).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, args.liveId, existingLive);

    const payload: JsonRecord = {
      eventType: 'live_update',
      liveId: args.liveId,
      title: readString(args.title),
      inviteOnly: args.inviteOnly,
      viewers: args.viewers,
      hosts: args.hosts ? parseJsonArray(args.hosts) : undefined,
      bannedUserIds: args.bannedUserIds ? parseJsonArray(args.bannedUserIds) : undefined,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveUpdate(ctx, payload);
  },
);

export const setLivePresence = schemaDb.reducer(
  {
    id: t.string(),
    userId: t.string(),
    activity: t.string(),
    liveId: t.option(t.string()),
    liveTitle: t.option(t.string()),
  },
  (ctx, args) => {
    const payload: JsonRecord = {
      eventType: 'live_presence',
      userId: args.userId,
      activity: args.activity,
      liveId: readString(args.liveId),
      liveTitle: readString(args.liveTitle),
      createdAt: nowMs(ctx),
    };

    authorizeLivePresencePayload(ctx, payload);
    applyLivePresence(ctx, payload);
  },
);

export const banLiveUser = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    targetUserId: t.string(),
    actorUserId: t.option(t.string()),
  },
  (ctx, args) => {
    const callerUserId = assertOptionalIdentityMatchesCaller(
      ctx,
      readString(args.actorUserId),
      'actorUserId',
    );
    const live = readLiveItem(ctx, args.liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, args.liveId, live);

    const payload: JsonRecord = {
      eventType: 'live_ban',
      liveId: args.liveId,
      targetUserId: args.targetUserId,
      actorUserId: callerUserId,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveBan(ctx, payload);
  },
);

export const unbanLiveUser = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    targetUserId: t.string(),
    actorUserId: t.option(t.string()),
  },
  (ctx, args) => {
    const callerUserId = assertOptionalIdentityMatchesCaller(
      ctx,
      readString(args.actorUserId),
      'actorUserId',
    );
    const live = readLiveItem(ctx, args.liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, args.liveId, live);

    const payload: JsonRecord = {
      eventType: 'live_unban',
      liveId: args.liveId,
      targetUserId: args.targetUserId,
      actorUserId: callerUserId,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveUnban(ctx, payload);
  },
);

export const endLive = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    actorUserId: t.option(t.string()),
  },
  (ctx, args) => {
    const callerUserId = assertOptionalIdentityMatchesCaller(
      ctx,
      readString(args.actorUserId),
      'actorUserId',
    );
    const live = readLiveItem(ctx, args.liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, args.liveId, live);

    const payload: JsonRecord = {
      eventType: 'live_end',
      liveId: args.liveId,
      actorUserId: callerUserId,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveEnd(ctx, payload);
  },
);

export const boostLive = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
    actorUserId: t.option(t.string()),
    amount: t.u32(),
  },
  (ctx, args) => {
    const callerUserId = assertOptionalIdentityMatchesCaller(
      ctx,
      readString(args.actorUserId),
      'actorUserId',
    );
    const live = readLiveItem(ctx, args.liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveParticipantOrAdmin(ctx, args.liveId, live);

    const payload: JsonRecord = {
      eventType: 'live_boost',
      liveId: args.liveId,
      actorUserId: callerUserId,
      amount: args.amount,
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `live:${args.liveId}`, toJsonString(payload));
    applyLiveBoost(ctx, payload);
  },
);

export const tickLiveEvent = schemaDb.reducer(
  {
    id: t.string(),
    liveId: t.string(),
  },
  (ctx, args) => {
    const live = readLiveItem(ctx, args.liveId);
    if (Object.keys(live).length === 0) {
      throw new Error(`Live "${args.liveId}" not found.`);
    }
    assertLiveOwnerOrAdmin(ctx, args.liveId, live);

    applyLiveEventTick(ctx, {
      eventType: 'live_event_tick',
      liveId: args.liveId,
      createdAt: nowMs(ctx),
    });
  },
);

export const sendCashToUser = schemaDb.reducer(
  {
    id: t.string(),
    fromUserId: t.string(),
    toUserId: t.string(),
    amountCash: t.u32(),
    note: t.option(t.string()),
    fromUserName: t.option(t.string()),
    fromUserAvatar: t.option(t.string()),
    messageId: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.fromUserId, 'fromUserId');
    const payload: JsonRecord = {
      eventType: 'cash_transfer',
      transferId: args.id,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      amountCash: args.amountCash,
      note: readString(args.note) ?? '',
      fromUserName: readString(args.fromUserName) ?? args.fromUserId,
      fromUserAvatar: readString(args.fromUserAvatar) ?? '',
      messageId: readString(args.messageId) ?? makeId(ctx, 'cash-message'),
      createdAt: nowMs(ctx),
    };

    upsertGlobalMessageRow(ctx, args.id, `wallet:${args.fromUserId}`, toJsonString(payload));
    applyCashTransfer(ctx, payload);
  },
);

export const purchaseFuelPack = schemaDb.reducer(
  {
    userId: t.string(),
    fuelAmount: t.u32(),
    paymentCurrency: t.string(),
    source: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');

    const fuelAmount = Math.max(0, toNonNegativeInt(args.fuelAmount));
    if (fuelAmount <= 0) {
      throw new Error('fuelAmount must be greater than zero.');
    }

    const pricing = FUEL_PACK_COSTS[fuelAmount];
    if (!pricing) {
      throw new Error('Unsupported fuel pack amount.');
    }

    const paymentCurrency = readString(args.paymentCurrency)?.toLowerCase();
    if (paymentCurrency !== 'gems' && paymentCurrency !== 'cash') {
      throw new Error('paymentCurrency must be gems or cash.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    const paymentAmount = paymentCurrency === 'gems' ? pricing.gems : pricing.cash;
    const currentBalance = paymentCurrency === 'gems' ? currentWallet.gems : currentWallet.cash;
    if (currentBalance < paymentAmount) {
      throw new Error(`Insufficient ${paymentCurrency}.`);
    }

    const nextWallet = {
      ...currentWallet,
      gems:
        paymentCurrency === 'gems'
          ? currentWallet.gems - paymentAmount
          : currentWallet.gems,
      cash:
        paymentCurrency === 'cash'
          ? currentWallet.cash - paymentAmount
          : currentWallet.cash,
      fuel: currentWallet.fuel + fuelAmount,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'purchase_fuel_pack',
      delta: {
        gems: paymentCurrency === 'gems' ? -paymentAmount : 0,
        cash: paymentCurrency === 'cash' ? -paymentAmount : 0,
        fuel: fuelAmount,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: readString(args.source) ?? 'wallet_purchase_fuel_pack',
        fuelAmount,
        paymentCurrency,
        paymentAmount,
      },
    });
  },
);

export const claimAdReward = schemaDb.reducer(
  {
    userId: t.string(),
    source: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems + AD_REWARD_GEMS,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'claim_ad_reward',
      delta: {
        gems: AD_REWARD_GEMS,
        cash: 0,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: readString(args.source) ?? 'wallet_claim_ad_reward',
        rewardGems: AD_REWARD_GEMS,
      },
    });
  },
);

export const creditGemsPurchase = schemaDb.reducer(
  {
    userId: t.string(),
    gemsToCredit: t.u32(),
    purchaseToken: t.string(),
    priceLabel: t.option(t.string()),
    source: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const gemsToCredit = Math.max(0, toNonNegativeInt(args.gemsToCredit));
    if (gemsToCredit <= 0) {
      throw new Error('gemsToCredit must be greater than zero.');
    }

    if (!TRUSTED_GEM_PURCHASE_AMOUNTS.has(gemsToCredit)) {
      throw new Error('Unsupported gems package.');
    }

    const purchaseToken = readString(args.purchaseToken);
    if (!purchaseToken) {
      throw new Error('purchaseToken is required.');
    }

    if (hasWalletPurchaseToken(ctx, args.userId, purchaseToken)) {
      throw new Error('purchaseToken has already been fulfilled.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems + gemsToCredit,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'credit_gems_purchase',
      delta: {
        gems: gemsToCredit,
        cash: 0,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: readString(args.source) ?? 'wallet_credit_gems_purchase',
        purchaseToken,
        priceLabel: readString(args.priceLabel) ?? undefined,
        gemsToCredit,
      },
    });
  },
);

export const convertGemsToCash = schemaDb.reducer(
  {
    userId: t.string(),
    gemsToConvert: t.u32(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const gemsToConvert = Math.max(0, toNonNegativeInt(args.gemsToConvert));
    if (gemsToConvert <= 0) {
      throw new Error('gemsToConvert must be greater than zero.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    if (currentWallet.gems < gemsToConvert) {
      throw new Error('Insufficient gems.');
    }

    const cashToCredit = gemsToConvert * GEM_TO_CASH_RATE;
    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems - gemsToConvert,
      cash: currentWallet.cash + cashToCredit,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'convert_gems_to_cash',
      delta: {
        gems: -gemsToConvert,
        cash: cashToCredit,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'wallet_convert_gems_to_cash',
        gemsToConvert,
        cashToCredit,
        gemToCashRate: GEM_TO_CASH_RATE,
      },
    });
  },
);

export const convertCashToGems = schemaDb.reducer(
  {
    userId: t.string(),
    cashToConvert: t.u32(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const cashToConvert = Math.max(0, toNonNegativeInt(args.cashToConvert));
    if (cashToConvert <= 0) {
      throw new Error('cashToConvert must be greater than zero.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    if (currentWallet.cash < cashToConvert) {
      throw new Error('Insufficient cash.');
    }

    const gemsToCredit = Math.floor(cashToConvert / CASH_TO_GEM_RATE);
    if (gemsToCredit <= 0) {
      throw new Error('cashToConvert is below minimum exchange amount.');
    }

    const spentCash = gemsToCredit * CASH_TO_GEM_RATE;
    const nextWallet = {
      ...currentWallet,
      cash: currentWallet.cash - spentCash,
      gems: currentWallet.gems + gemsToCredit,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'convert_cash_to_gems',
      delta: {
        gems: gemsToCredit,
        cash: -spentCash,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'wallet_convert_cash_to_gems',
        requestedCashToConvert: cashToConvert,
        spentCash,
        gemsToCredit,
        cashToGemRate: CASH_TO_GEM_RATE,
      },
    });
  },
);

export const adminCreditGems = schemaDb.reducer(
  {
    targetUserId: t.string(),
    gemsToAdd: t.u32(),
    reason: t.option(t.string()),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const gemsToAdd = Math.max(0, toNonNegativeInt(args.gemsToAdd));
    if (gemsToAdd <= 0) {
      return;
    }

    const accountState = readAccountStateItem(ctx, args.targetUserId);
    const currentWallet = readWalletFromAccountState(accountState);
    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems + gemsToAdd,
    };

    writeAccountStateItem(
      ctx,
      args.targetUserId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.targetUserId,
      eventType: 'admin_credit_gems',
      delta: {
        gems: gemsToAdd,
        cash: 0,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'adminCreditGems',
        adminUserId,
        reason: readString(args.reason) ?? 'Admin credit gems',
      },
    });
  },
);

export const adminCreditCash = schemaDb.reducer(
  {
    targetUserId: t.string(),
    cashToAdd: t.u32(),
    reason: t.option(t.string()),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const cashToAdd = Math.max(0, toNonNegativeInt(args.cashToAdd));
    if (cashToAdd <= 0) {
      return;
    }

    const accountState = readAccountStateItem(ctx, args.targetUserId);
    const currentWallet = readWalletFromAccountState(accountState);
    const nextWallet = {
      ...currentWallet,
      cash: currentWallet.cash + cashToAdd,
    };

    writeAccountStateItem(
      ctx,
      args.targetUserId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.targetUserId,
      eventType: 'admin_credit_cash',
      delta: {
        gems: 0,
        cash: cashToAdd,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'adminCreditCash',
        adminUserId,
        reason: readString(args.reason) ?? 'Admin credit cash',
      },
    });
  },
);

export const convertGemsToFuel = schemaDb.reducer(
  {
    userId: t.string(),
    gemsToConvert: t.u32(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const gemsToConvert = Math.max(0, toNonNegativeInt(args.gemsToConvert));
    if (gemsToConvert <= 0) {
      throw new Error('gemsToConvert must be greater than zero.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    if (currentWallet.gems < gemsToConvert) {
      throw new Error('Insufficient gems.');
    }

    const fuelToAdd = gemsToConvert * GEMS_TO_FUEL_RATE;
    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems - gemsToConvert,
      fuel: currentWallet.fuel + fuelToAdd,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'convert_gems_to_fuel',
      delta: {
        gems: -gemsToConvert,
        cash: 0,
        fuel: fuelToAdd,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'convertGemsToFuel',
        gemsToConvert,
        fuelAdded: fuelToAdd,
        gemsToFuelRate: GEMS_TO_FUEL_RATE,
      },
    });
  },
);

export const spendFuel = schemaDb.reducer(
  {
    userId: t.string(),
    fuelToSpend: t.u32(),
    reason: t.option(t.string()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');
    const fuelToSpend = Math.max(0, toNonNegativeInt(args.fuelToSpend));
    if (fuelToSpend <= 0) {
      throw new Error('fuelToSpend must be greater than zero.');
    }

    const accountState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(accountState);
    if (currentWallet.fuel < fuelToSpend) {
      throw new Error('Insufficient fuel.');
    }

    const nextWallet = {
      ...currentWallet,
      fuel: currentWallet.fuel - fuelToSpend,
    };

    writeAccountStateItem(
      ctx,
      args.userId,
      writeWalletToAccountState(accountState, nextWallet),
    );

    appendWalletTransaction(ctx, {
      userId: args.userId,
      eventType: 'spend_fuel',
      delta: {
        gems: 0,
        cash: 0,
        fuel: -fuelToSpend,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'spendFuel',
        reason: readString(args.reason) ?? 'Fuel spend',
      },
    });
  },
);

export const sendGlobalMessage = schemaDb.reducer(
  {
    id: t.string(),
    roomId: t.string(),
    item: t.string(),
  },
  (ctx, args) => {
    routeGlobalMessage(ctx, args.id, args.roomId, args.item);
  },
);

export const editGlobalMessage = schemaDb.reducer(
  {
    id: t.string(),
    text: t.string(),
  },
  (ctx, args) => {
    const nextText = readString(args.text)?.trim() ?? '';
    if (nextText.length === 0) {
      throw new Error('global_message_text_required');
    }

    const { row, payload } = readMutableGlobalChatMessage(ctx, args.id);
    payload.text = nextText;
    payload.edited = true;
    payload.editedAt = nowMs(ctx);

    upsertGlobalMessageRow(
      ctx,
      args.id,
      readString(row.roomId) ?? 'global',
      toJsonString(payload),
      row.createdAt ?? ctx.timestamp,
    );
    upsertMentionUsersFromText(ctx, nextText);
  },
);

export const deleteGlobalMessage = schemaDb.reducer(
  {
    id: t.string(),
  },
  (ctx, args) => {
    const { row } = readMutableGlobalChatMessage(ctx, args.id);
    ctx.db.globalMessageItem.id.delete(readString(row.id) ?? args.id);
  },
);

export const grantAdminCurrency = schemaDb.reducer(
  {
    targetUserId: t.string(),
    gemsToAdd: t.u32(),
    cashToAdd: t.u32(),
  },
  (ctx, args) => {
    const adminUserId = callerIsDbOwnerIdentity(ctx) ? DB_OWNER_IDENTITY : assertAdmin(ctx);
    const accountState = readAccountStateItem(ctx, args.targetUserId);
    const currentWallet = readWalletFromAccountState(accountState);

    const nextWallet = {
      ...currentWallet,
      gems: currentWallet.gems + args.gemsToAdd,
      cash: currentWallet.cash + args.cashToAdd,
    };

    const nextState = writeWalletToAccountState(accountState, nextWallet);
    writeAccountStateItem(ctx, args.targetUserId, nextState);

    appendWalletTransaction(ctx, {
      userId: args.targetUserId,
      eventType: 'grant_admin_currency',
      delta: {
        gems: args.gemsToAdd,
        cash: args.cashToAdd,
        fuel: 0,
      },
      balanceBefore: currentWallet,
      balanceAfter: nextWallet,
      metadata: {
        source: 'grantAdminCurrency',
        adminUserId,
      },
    });

    const txId = makeId(ctx, 'tx-admin-credit');
    ctx.db.adminWalletCreditTransaction.insert({
      id: txId,
      adminUserId,
      targetUserId: args.targetUserId,
      deltaGems: args.gemsToAdd,
      deltaCash: args.cashToAdd,
      deltaFuel: 0,
      reason: 'Admin Seeding Currency',
      balanceBefore: toJsonString(accountState),
      balanceAfter: toJsonString(nextState),
      metadata: toJsonString({ source: 'grantAdminCurrency' }),
      createdAt: ctx.timestamp,
    });
  },
);

export const appendAuditLog = schemaDb.reducer(
  {
    id: t.string(),
    actorUserId: t.string(),
    item: t.string(),
  },
  (ctx, args) => {
    const actorUserId = assertAdmin(ctx);
    const requestedActorUserId = readString(args.actorUserId);
    if (requestedActorUserId && requestedActorUserId !== actorUserId) {
      unauthorized('actorUserId must match caller identity.');
    }
    const existing = ctx.db.auditLogItem.id.find(args.id);
    if (existing) {
      ctx.db.auditLogItem.id.delete(args.id);
    }
    ctx.db.auditLogItem.insert({
      id: args.id,
      actorUserId,
      item: args.item,
      createdAt: ctx.timestamp,
    });
  },
);

export const appendModerationAction = schemaDb.reducer(
  {
    id: t.string(),
    targetUserId: t.option(t.string()),
    item: t.string(),
  },
  (ctx, args) => {
    const actorUserId = assertAdmin(ctx);
    const existing = ctx.db.moderationActionItem.id.find(args.id);
    if (existing) {
      ctx.db.moderationActionItem.id.delete(args.id);
    }
    ctx.db.moderationActionItem.insert({
      id: args.id,
      actorUserId,
      targetUserId: readString(args.targetUserId) ?? '',
      item: args.item,
      createdAt: ctx.timestamp,
    });
  },
);

export const submitWithdrawalRequest = schemaDb.reducer(
  {
    id: t.string(),
    userId: t.string(),
    item: t.string(),
  },
  (ctx, args) => {
    assertSelf(ctx, args.userId, 'userId');

    const existing = ctx.db.withdrawalRequestItem.id.find(args.id);
    if (existing) {
      ctx.db.withdrawalRequestItem.id.delete(args.id);
    }
    ctx.db.withdrawalRequestItem.insert({
      id: args.id,
      userId: args.userId,
      item: args.item,
      createdAt: ctx.timestamp,
    });

    const currentState = readAccountStateItem(ctx, args.userId);
    const currentWallet = readWalletFromAccountState(currentState);
    const nextWallet = {
      ...currentWallet,
      withdrawalHistory: [...currentWallet.withdrawalHistory, parseJsonRecord(args.item)],
    };
    const nextState = writeWalletToAccountState(currentState, nextWallet);
    writeAccountStateItem(ctx, args.userId, nextState);
  },
);
