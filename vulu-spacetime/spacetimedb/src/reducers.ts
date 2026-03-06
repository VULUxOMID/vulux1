import { t } from 'spacetimedb/server';

import { spacetimedb as schemaDb } from './schema';
import {
  PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
  PROFILE_VIEW_METRIC_NAME,
  PROFILE_VIEW_METRIC_VERSION_V2,
  evaluateProfileViewDecision,
  normalizeProfileViewDedupeWindowMs,
} from './profileViewMetrics';
import { resolveProfileIdentityFields } from './profileIdentity';
import {
  buildReportDedupeKey,
  evaluateReportSubmissionPolicy,
  normalizeReportStatus,
} from './reportingPolicy';

type JsonRecord = Record<string, unknown>;
type JsonArray = unknown[];

const MAX_THREAD_MESSAGES = 500;
const LIVE_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const LIVE_EVENT_WINNER_INTERVAL_MS = 15 * 60 * 1000;
const GEMS_TO_FUEL_RATE = 4;
const GEM_TO_CASH_RATE = 10;
const CASH_TO_GEM_RATE = 10;
const AD_REWARD_GEMS = 10;
const PROFILE_VIEW_DEFAULT_MIGRATION_MODE = 'start_fresh_from_cutover';

const FUEL_PACK_COSTS: Record<number, { gems: number; cash: number }> = {
  30: { gems: 12, cash: 120 },
  60: { gems: 20, cash: 200 },
  120: { gems: 35, cash: 350 },
  300: { gems: 80, cash: 800 },
  600: { gems: 150, cash: 1500 },
};

const TRUSTED_GEM_PURCHASE_AMOUNTS = new Set([100, 550, 1200, 2500]);
const REPORT_REASON_MAX_LENGTH = 80;
const REPORT_DETAILS_MAX_LENGTH = 1000;
const REPORT_CONTEXT_MAX_LENGTH = 4000;

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

function startOfUtcDayMs(valueMs: number): number {
  const date = new Date(valueMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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
const EVENT_WIDGET_CONFIG_ROW_ID = 'global';
const EVENT_WIDGET_DEFAULT_ENTRY_AMOUNT_CASH = 0;
const EVENT_WIDGET_DEFAULT_DRAW_DURATION_MINUTES = LIVE_EVENT_DURATION_MS / 60_000;
const EVENT_WIDGET_DEFAULT_DRAW_INTERVAL_MINUTES = LIVE_EVENT_WINNER_INTERVAL_MS / 60_000;
const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN = 0;
const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX = 1_000_000;
const EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN = 1;
const EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX = 24 * 60;
const EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN = 1;
const EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX = 24 * 60;

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

type EventWidgetConfig = {
  enabled: boolean;
  entryAmountCash: number;
  drawDurationMinutes: number;
  drawIntervalMinutes: number;
  autoplayEnabled: boolean;
  updatedBy: string;
  updatedAtMs: number;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function readBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = readNumber(value);
  if (parsed === null) return fallback;
  return clampInt(parsed, min, max);
}

function readBoundedIntPatch(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  return readBoundedInt(value, fallback, min, max);
}

function readBooleanPatch(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = readBooleanLike(value);
  return parsed === null ? fallback : parsed;
}

function readEventWidgetConfig(ctx: any): EventWidgetConfig {
  const row = ctx.db.eventWidgetConfigItem.id.find(EVENT_WIDGET_CONFIG_ROW_ID);
  const drawDurationMinutes = readBoundedInt(
    row?.drawDurationMinutes,
    EVENT_WIDGET_DEFAULT_DRAW_DURATION_MINUTES,
    EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN,
    EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX,
  );
  const drawIntervalMinutes = Math.min(
    drawDurationMinutes,
    readBoundedInt(
      row?.drawIntervalMinutes,
      EVENT_WIDGET_DEFAULT_DRAW_INTERVAL_MINUTES,
      EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN,
      EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX,
    ),
  );

  return {
    enabled: readBooleanLike(row?.enabled) ?? true,
    entryAmountCash: readBoundedInt(
      row?.entryAmountCash,
      EVENT_WIDGET_DEFAULT_ENTRY_AMOUNT_CASH,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    ),
    drawDurationMinutes,
    drawIntervalMinutes,
    autoplayEnabled: readBooleanLike(row?.autoplayEnabled) ?? true,
    updatedBy: readString(row?.updatedBy) ?? 'system',
    updatedAtMs: timestampToMs(row?.updatedAt ?? ctx.timestamp),
  };
}

function writeEventWidgetConfig(
  ctx: any,
  config: EventWidgetConfig,
): void {
  const existing = ctx.db.eventWidgetConfigItem.id.find(EVENT_WIDGET_CONFIG_ROW_ID);
  if (existing) {
    ctx.db.eventWidgetConfigItem.id.delete(EVENT_WIDGET_CONFIG_ROW_ID);
  }

  ctx.db.eventWidgetConfigItem.insert({
    id: EVENT_WIDGET_CONFIG_ROW_ID,
    enabled: config.enabled,
    entryAmountCash: config.entryAmountCash,
    drawDurationMinutes: config.drawDurationMinutes,
    drawIntervalMinutes: config.drawIntervalMinutes,
    autoplayEnabled: config.autoplayEnabled,
    updatedBy: config.updatedBy,
    updatedAt: ctx.timestamp,
  });
}

function appendEventWidgetConfigAudit(
  ctx: any,
  actorUserId: string,
  action: string,
  previousConfig: EventWidgetConfig,
  nextConfig: EventWidgetConfig,
): void {
  const changedFields: string[] = [];
  if (previousConfig.enabled !== nextConfig.enabled) changedFields.push('enabled');
  if (previousConfig.entryAmountCash !== nextConfig.entryAmountCash) changedFields.push('entryAmountCash');
  if (previousConfig.drawDurationMinutes !== nextConfig.drawDurationMinutes) changedFields.push('drawDurationMinutes');
  if (previousConfig.drawIntervalMinutes !== nextConfig.drawIntervalMinutes) changedFields.push('drawIntervalMinutes');
  if (previousConfig.autoplayEnabled !== nextConfig.autoplayEnabled) changedFields.push('autoplayEnabled');

  ctx.db.eventWidgetConfigAuditItem.insert({
    id: makeId(ctx, 'event-widget-config-audit'),
    action,
    actorUserId,
    item: toJsonString({
      category: 'event_widget_config',
      actionType: action,
      actorUserId,
      changedFields,
      previousConfig,
      nextConfig,
      createdAt: nowMs(ctx),
    }),
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
  payload.inviterUserId = callerUserId;
}

function authorizeLiveInviteResponsePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const legacyCallerUserId = readLegacyCallerUserIdFromClaims(ctx);
  const responderUserId = readString(payload.responderUserId) ?? readString(payload.targetUserId);
  if (
    responderUserId &&
    responderUserId !== callerUserId &&
    (!legacyCallerUserId || responderUserId !== legacyCallerUserId)
  ) {
    unauthorized('live_invite_response responderUserId must match caller identity.');
  }

  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_invite_response liveId is required.');
  }

  const live = assertLiveParticipationAllowed(ctx, liveId, callerUserId);
  const pendingInvites = new Set(normalizePendingCoHostInviteUserIds(live.pendingCoHostInviteUserIds));
  const normalizedResponderUserId = callerUserId;
  if (!pendingInvites.has(normalizedResponderUserId)) {
    unauthorized('No pending co-host invite.');
  }

  payload.liveId = liveId;
  payload.targetUserId = normalizedResponderUserId;
  payload.responderUserId = normalizedResponderUserId;
  payload.accepted = readBooleanLike(payload.accepted) === true;
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

  const live = assertLiveParticipationAllowed(ctx, liveId, callerUserId);
  if (isLiveHostUser(live, callerUserId)) {
    unauthorized('Hosts cannot request co-host access.');
  }

  payload.liveId = liveId;
  payload.requesterUserId = callerUserId;
}

function authorizeLiveHostRequestResponsePayload(ctx: any, payload: JsonRecord): void {
  const callerUserId = resolveCallerUserId(ctx);
  const liveId = readString(payload.liveId);
  if (!liveId) {
    throw new Error('live_host_request_response liveId is required.');
  }

  const targetUserId = readString(payload.targetUserId);
  if (!targetUserId) {
    throw new Error('live_host_request_response targetUserId is required.');
  }

  const live = assertLiveParticipationAllowed(ctx, liveId, callerUserId);
  assertLiveOwnerOrAdmin(ctx, liveId, live);

  const pendingRequests = new Set(normalizePendingHostRequestUserIds(live.pendingHostRequestUserIds));
  if (!pendingRequests.has(targetUserId)) {
    unauthorized('No pending host request.');
  }

  payload.liveId = liveId;
  payload.targetUserId = targetUserId;
  payload.actorUserId = callerUserId;
  payload.accepted = readBooleanLike(payload.accepted) === true;
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

  if (eventType === 'live_invite_response') {
    authorizeLiveInviteResponsePayload(ctx, payload);
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
    resolveFriendlyUserLabel(userId, [
      readString(profile.username),
      readString(profile.displayName),
      readString(profile.name),
      readString(social.username),
      readString(social.name),
    ]);

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

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new Error(`Text must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function readReportTargetType(value: unknown): 'user' | 'message' | 'live' {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === 'user' || normalized === 'message' || normalized === 'live') {
    return normalized;
  }
  throw new Error('targetType must be one of: user, message, live.');
}

function readReportRow(ctx: any, reportId: string) {
  return ctx.db.reportItem.id.find(reportId) ?? null;
}

function upsertReportRow(ctx: any, row: {
  id: string;
  reporterUserId: string;
  targetType: string;
  targetId: string;
  reportedUserId: string | null;
  surface: string;
  reason: string;
  details: string | null;
  contextJson: string;
  status: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAtIsoUtc: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}) {
  const existing = ctx.db.reportItem.id.find(row.id);
  if (existing) {
    ctx.db.reportItem.id.delete(row.id);
  }

  ctx.db.reportItem.insert({
    id: row.id,
    reporterUserId: row.reporterUserId,
    targetType: row.targetType,
    targetId: row.targetId,
    reportedUserId: row.reportedUserId,
    surface: row.surface,
    reason: row.reason,
    details: row.details,
    contextJson: row.contextJson,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewNotes: row.reviewNotes,
    reviewedAtIsoUtc: row.reviewedAtIsoUtc,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function appendReportModerationAction(
  ctx: any,
  input: {
    actionType: 'report_submitted' | 'report_reviewed';
    actorUserId: string;
    reportId: string;
    targetUserId?: string | null;
    payload: JsonRecord;
  },
): void {
  ctx.db.moderationActionItem.insert({
    id: makeId(ctx, 'moderation-report'),
    actorUserId: input.actorUserId,
    targetUserId: readString(input.targetUserId) ?? '',
    item: toJsonString({
      actionType: input.actionType,
      reportId: input.reportId,
      ...input.payload,
    }),
    createdAt: ctx.timestamp,
  });
}

function buildReportModerationContext(
  ctx: any,
  input: {
    targetType: 'user' | 'message' | 'live';
    targetId: string;
    surface: string;
    clientContext: JsonRecord;
  },
): { context: JsonRecord; reportedUserId: string | null } {
  const clientContext = { ...input.clientContext };
  const context: JsonRecord = {
    ...clientContext,
    surface: input.surface,
    targetType: input.targetType,
    targetId: input.targetId,
  };

  if (input.targetType === 'user') {
    const profileSummary = readPublicProfileSummaryItem(ctx, input.targetId);
    if (profileSummary) {
      context.reportedUsername = readString(profileSummary.username) ?? input.targetId;
      context.reportedAvatarUrl = readString(profileSummary.avatarUrl);
      context.reportedBadge = readString(profileSummary.badge);
    }
    return {
      context,
      reportedUserId: input.targetId,
    };
  }

  if (input.targetType === 'message') {
    const messageRow = ctx.db.globalMessageItem.id.find(input.targetId);
    if (messageRow) {
      const payload = parseJsonRecord(messageRow.item);
      const senderId = readString(payload.senderId);
      const senderProfile = readPublicProfileSummaryItem(ctx, senderId);
      context.roomId = readString(messageRow.roomId) ?? readString(payload.roomId) ?? 'global';
      context.messageText = readString(payload.text);
      context.messageExcerpt = readString(payload.text)?.slice(0, 240) ?? null;
      context.messageType = readString(payload.type);
      context.messageCreatedAtMs = timestampToMs(messageRow.createdAt);
      context.messageSenderUserId = senderId;
      context.messageSenderUsername =
        readString(senderProfile?.username) ??
        readString(payload.user) ??
        readString(payload.username);
      return {
        context,
        reportedUserId: senderId,
      };
    }

    return {
      context,
      reportedUserId: normalizeOptionalText(clientContext.reportedUserId, 200),
    };
  }

  const live = readLiveItem(ctx, input.targetId);
  const hostUserId =
    readString(live.hostUserId) ??
    readString(live.ownerUserId) ??
    readString((normalizeHostList(live.hosts)[0] ?? {}).id);
  const hostProfile = readPublicProfileSummaryItem(ctx, hostUserId);
  context.liveTitle = readString(live.title) ?? readString(clientContext.liveTitle);
  context.liveViewerCount = toNonNegativeInt(live.viewers, toNonNegativeInt(clientContext.liveViewerCount));
  context.liveHostUserId = hostUserId;
  context.liveHostUsername =
    readString(hostProfile?.username) ??
    readString((normalizeHostList(live.hosts)[0] ?? {}).username) ??
    readString(clientContext.liveHostUsername);
  context.liveEndedAt = toNonNegativeInt(live.endedAt);
  return {
    context,
    reportedUserId: hostUserId,
  };
}

function listExistingReportPolicyRecords(ctx: any): Array<{
  reporterUserId: string;
  dedupeKey: string;
  createdAtMs: number;
}> {
  const rows: Array<{ reporterUserId: string; dedupeKey: string; createdAtMs: number }> = [];
  for (const row of ctx.db.reportItem.iter()) {
    rows.push({
      reporterUserId: readString(row.reporterUserId) ?? '',
      dedupeKey: buildReportDedupeKey({
        reporterUserId: readString(row.reporterUserId) ?? '',
        targetType: readString(row.targetType) ?? '',
        targetId: readString(row.targetId) ?? '',
        surface: readString(row.surface) ?? '',
        reason: readString(row.reason) ?? '',
      }),
      createdAtMs: timestampToMs(row.createdAt),
    });
  }
  return rows;
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

function buildProfileViewPairKey(viewerUserId: string, profileUserId: string): string {
  return `${viewerUserId}::${profileUserId}`;
}

function buildProfileViewUniqueViewerKey(profileUserId: string, viewerUserId: string): string {
  return `${profileUserId}::${viewerUserId}`;
}

type ProfileViewMetricCutoverState = {
  activeVersion: string;
  cutoverAtMs: number;
  dedupeWindowMs: number;
  migrationMode: string;
  notes: string | null;
};

function upsertProfileViewMetricCutoverItem(
  ctx: any,
  params: {
    activeVersion: string;
    cutoverAtMs: number;
    dedupeWindowMs: number;
    migrationMode: string;
    notes: string | null;
    updatedBy: string | null;
  },
): void {
  const existing = ctx.db.profileViewMetricCutoverItem.metricName.find(PROFILE_VIEW_METRIC_NAME);
  if (existing) {
    ctx.db.profileViewMetricCutoverItem.metricName.delete(PROFILE_VIEW_METRIC_NAME);
  }

  ctx.db.profileViewMetricCutoverItem.insert({
    metricName: PROFILE_VIEW_METRIC_NAME,
    activeVersion: params.activeVersion,
    cutoverAtMs: String(Math.max(0, Math.floor(params.cutoverAtMs))),
    dedupeWindowMs: normalizeProfileViewDedupeWindowMs(params.dedupeWindowMs),
    migrationMode: readString(params.migrationMode) ?? PROFILE_VIEW_DEFAULT_MIGRATION_MODE,
    notes: params.notes ?? undefined,
    updatedBy: params.updatedBy ?? undefined,
    updatedAt: ctx.timestamp,
  });
}

function ensureProfileViewMetricCutoverState(
  ctx: any,
  updatedBy: string | null = null,
): ProfileViewMetricCutoverState {
  const existing = ctx.db.profileViewMetricCutoverItem.metricName.find(PROFILE_VIEW_METRIC_NAME);
  if (existing) {
    return {
      activeVersion: readString(existing.activeVersion) ?? PROFILE_VIEW_METRIC_VERSION_V2,
      cutoverAtMs: toNonNegativeInt(existing.cutoverAtMs),
      dedupeWindowMs: normalizeProfileViewDedupeWindowMs(existing.dedupeWindowMs),
      migrationMode:
        readString(existing.migrationMode) ?? PROFILE_VIEW_DEFAULT_MIGRATION_MODE,
      notes: readString(existing.notes),
    };
  }

  const state: ProfileViewMetricCutoverState = {
    activeVersion: PROFILE_VIEW_METRIC_VERSION_V2,
    cutoverAtMs: nowMs(ctx),
    dedupeWindowMs: PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
    migrationMode: PROFILE_VIEW_DEFAULT_MIGRATION_MODE,
    notes: 'v2 deduped profile-view metric started at cutover time.',
  };
  upsertProfileViewMetricCutoverItem(ctx, {
    ...state,
    updatedBy,
  });
  return state;
}

function appendProfileViewAttemptV2Item(
  ctx: any,
  params: {
    id: string;
    viewerUserId: string | null;
    profileUserId: string | null;
    metricVersion: string;
    occurredAtMs: number;
    dedupeWindowMs: number;
    counted: boolean;
    dropReason: string | null;
    source: string | null;
  },
): void {
  ctx.db.profileViewAttemptV2Item.insert({
    id: params.id,
    viewerUserId: params.viewerUserId ?? '',
    profileUserId: params.profileUserId ?? '',
    metricVersion: readString(params.metricVersion) ?? PROFILE_VIEW_METRIC_VERSION_V2,
    occurredAtMs: String(Math.max(0, Math.floor(params.occurredAtMs))),
    dedupeWindowMs: normalizeProfileViewDedupeWindowMs(params.dedupeWindowMs),
    counted: params.counted,
    dropReason: params.dropReason ?? undefined,
    source: params.source ?? undefined,
    createdAt: ctx.timestamp,
  });
}

function upsertProfileViewDedupeStateV2Item(
  ctx: any,
  params: {
    viewerUserId: string;
    profileUserId: string;
    lastCountedAtMs: number;
    lastEventId: string;
  },
): void {
  const key = buildProfileViewPairKey(params.viewerUserId, params.profileUserId);
  const existing = ctx.db.profileViewDedupeStateV2Item.key.find(key);
  if (existing) {
    ctx.db.profileViewDedupeStateV2Item.key.delete(key);
  }

  ctx.db.profileViewDedupeStateV2Item.insert({
    key,
    viewerUserId: params.viewerUserId,
    profileUserId: params.profileUserId,
    lastCountedAtMs: String(Math.max(0, Math.floor(params.lastCountedAtMs))),
    lastEventId: params.lastEventId,
    updatedAt: ctx.timestamp,
  });
}

function upsertProfileViewAggregateV2Item(
  ctx: any,
  params: {
    profileUserId: string;
    countedTotal: number;
    uniqueViewerTotal: number;
    lastCountedAtMs: number;
  },
): void {
  const existing = ctx.db.profileViewAggregateV2Item.profileUserId.find(params.profileUserId);
  if (existing) {
    ctx.db.profileViewAggregateV2Item.profileUserId.delete(params.profileUserId);
  }

  ctx.db.profileViewAggregateV2Item.insert({
    profileUserId: params.profileUserId,
    countedTotal: Math.max(0, toNonNegativeInt(params.countedTotal)),
    uniqueViewerTotal: Math.max(0, toNonNegativeInt(params.uniqueViewerTotal)),
    lastCountedAtMs: String(Math.max(0, Math.floor(params.lastCountedAtMs))),
    updatedAt: ctx.timestamp,
  });
}

function upsertProfileViewUniqueViewerV2Item(
  ctx: any,
  params: {
    profileUserId: string;
    viewerUserId: string;
    occurredAtMs: number;
  },
): { isNewUniqueViewer: boolean } {
  const key = buildProfileViewUniqueViewerKey(params.profileUserId, params.viewerUserId);
  const existing = ctx.db.profileViewUniqueViewerV2Item.key.find(key);
  if (!existing) {
    ctx.db.profileViewUniqueViewerV2Item.insert({
      key,
      profileUserId: params.profileUserId,
      viewerUserId: params.viewerUserId,
      firstCountedAtMs: String(Math.max(0, Math.floor(params.occurredAtMs))),
      lastCountedAtMs: String(Math.max(0, Math.floor(params.occurredAtMs))),
      viewCount: 1,
      updatedAt: ctx.timestamp,
    });
    return { isNewUniqueViewer: true };
  }

  ctx.db.profileViewUniqueViewerV2Item.key.delete(key);
  ctx.db.profileViewUniqueViewerV2Item.insert({
    key,
    profileUserId: params.profileUserId,
    viewerUserId: params.viewerUserId,
    firstCountedAtMs: readString(existing.firstCountedAtMs) ?? String(params.occurredAtMs),
    lastCountedAtMs: String(Math.max(0, Math.floor(params.occurredAtMs))),
    viewCount: Math.max(1, toNonNegativeInt(existing.viewCount, 1) + 1),
    updatedAt: ctx.timestamp,
  });
  return { isNewUniqueViewer: false };
}

function applyTrackProfileViewV2(ctx: any, payload: JsonRecord): void {
  const eventId = readString(payload.id) ?? makeId(ctx, 'profile-view-v2');
  const viewerUserId = readString(payload.viewerUserId);
  const profileUserId = readString(payload.profileUserId);
  const source = readString(payload.source);
  const metricCutover = ensureProfileViewMetricCutoverState(ctx, viewerUserId ?? null);
  const existingAttempt = ctx.db.profileViewAttemptV2Item.id.find(eventId);
  if (existingAttempt) {
    return;
  }

  const pairKey =
    viewerUserId && profileUserId
      ? buildProfileViewPairKey(viewerUserId, profileUserId)
      : null;
  const dedupeState = pairKey
    ? ctx.db.profileViewDedupeStateV2Item.key.find(pairKey)
    : null;
  const decision = evaluateProfileViewDecision({
    viewerUserId,
    profileUserId,
    nowMs: nowMs(ctx),
    occurredAtMs: payload.occurredAtMs ?? payload.viewedAtMs ?? payload.viewedAt ?? payload.createdAt,
    cutoverAtMs: metricCutover.cutoverAtMs,
    dedupeWindowMs:
      payload.dedupeWindowMs ??
      payload.dedupeWindow ??
      metricCutover.dedupeWindowMs,
    lastCountedAtMs: dedupeState?.lastCountedAtMs,
  });

  appendProfileViewAttemptV2Item(ctx, {
    id: eventId,
    viewerUserId,
    profileUserId,
    metricVersion: metricCutover.activeVersion,
    occurredAtMs: decision.occurredAtMs,
    dedupeWindowMs: decision.dedupeWindowMs,
    counted: decision.counted,
    dropReason: decision.dropReason,
    source,
  });

  if (!decision.counted || !viewerUserId || !profileUserId) {
    return;
  }

  upsertProfileViewDedupeStateV2Item(ctx, {
    viewerUserId,
    profileUserId,
    lastCountedAtMs: decision.occurredAtMs,
    lastEventId: eventId,
  });

  const { isNewUniqueViewer } = upsertProfileViewUniqueViewerV2Item(ctx, {
    profileUserId,
    viewerUserId,
    occurredAtMs: decision.occurredAtMs,
  });
  const aggregate = ctx.db.profileViewAggregateV2Item.profileUserId.find(profileUserId);
  const countedTotal = Math.max(0, toNonNegativeInt(aggregate?.countedTotal, 0) + 1);
  const uniqueViewerTotal = Math.max(
    0,
    toNonNegativeInt(aggregate?.uniqueViewerTotal, 0) + (isNewUniqueViewer ? 1 : 0),
  );
  upsertProfileViewAggregateV2Item(ctx, {
    profileUserId,
    countedTotal,
    uniqueViewerTotal,
    lastCountedAtMs: decision.occurredAtMs,
  });

  const profileSummary = readPublicProfileSummaryItem(ctx, viewerUserId);
  const viewerDisplayName = resolveFriendlyUserLabel(viewerUserId, [
    readString(profileSummary?.username),
    viewerUserId,
  ]);
  const viewerAvatarUrl = readString(profileSummary?.avatarUrl) ?? '';
  const notificationId = `notif-profile-view-v2-${eventId}`;
  upsertNotificationItem(ctx, notificationId, profileUserId, {
    id: notificationId,
    type: 'profile_view',
    createdAt: decision.occurredAtMs,
    read: false,
    viewer: {
      id: viewerUserId,
      name: viewerDisplayName,
      avatar: viewerAvatarUrl,
      level: 0,
    },
    viewCount: 1,
    lastViewed: decision.occurredAtMs,
    metricVersion: metricCutover.activeVersion,
    migrationMode: metricCutover.migrationMode,
    countedEventId: eventId,
  });
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

type LivePresenceActivity = 'hosting' | 'watching';
type PublicLivePresenceActivity = LivePresenceActivity | 'blocked';

function upsertPublicLivePresenceItem(
  ctx: any,
  userId: string,
  liveId: string,
  activity: PublicLivePresenceActivity,
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
  const normalizedActivity: LivePresenceActivity | null =
    activity === 'hosting' ? 'hosting' : activity === 'watching' ? 'watching' : null;

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

function markLivePresenceBlocked(ctx: any, userId: string, liveId: string): void {
  const existingPresence = readLivePresenceItem(ctx, userId);
  upsertLivePresenceItem(ctx, userId, {
    ...existingPresence,
    userId,
    liveId,
    activity: 'none',
    rejectionCode: 'banned',
    updatedAt: nowMs(ctx),
  });
  upsertPublicLivePresenceItem(ctx, userId, liveId, 'blocked');
}

function upsertEventParticipationItem(
  ctx: any,
  userId: string,
  liveId: string,
  activity: 'hosting' | 'watching',
): void {
  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) {
    return;
  }

  const event = isRecord(live.event) ? live.event : {};
  if (readBoolean(event.enabled) === false) {
    return;
  }

  const now = nowMs(ctx);
  const endedAt = toNonNegativeInt(event.endedAt);
  if (endedAt > 0 && endedAt <= now) {
    return;
  }

  const dayBucketStartIsoUtc = toIsoString(startOfUtcDayMs(now));
  const rowId = `${liveId}::${userId}::${dayBucketStartIsoUtc}`;
  const existing = ctx.db.eventParticipationItem.id.find(rowId);

  if (existing) {
    ctx.db.eventParticipationItem.id.delete(rowId);
  }

  ctx.db.eventParticipationItem.insert({
    id: rowId,
    liveId,
    userId,
    dayBucketStartIsoUtc,
    activity,
    source: 'set_live_presence',
    firstSeenAtIsoUtc: readString(existing?.firstSeenAtIsoUtc) ?? toIsoString(now),
    lastSeenAtIsoUtc: toIsoString(now),
  });
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

function normalizePendingHostRequestUserIds(value: unknown): string[] {
  if (!isArray(value)) return [];

  const result = new Set<string>();
  value.forEach((entry) => {
    const userId = readString(entry);
    if (userId) result.add(userId);
  });
  return Array.from(result);
}

function normalizePendingCoHostInviteUserIds(value: unknown): string[] {
  if (!isArray(value)) return [];

  const result = new Set<string>();
  value.forEach((entry) => {
    const userId = readString(entry);
    if (userId) result.add(userId);
  });
  return Array.from(result);
}

function buildLiveHostFromProfile(ctx: any, userId: string): JsonRecord {
  const profileSummary = readPublicProfileSummaryItem(ctx, userId);
  const username = resolveFriendlyUserLabel(userId, [
    readString(profileSummary?.username),
    userId,
  ]);
  const avatar = firstDefinedString([
    readString(profileSummary?.avatarUrl),
  ]) ?? '';

  return {
    id: userId,
    username,
    name: username,
    age: 0,
    country: '',
    bio: '',
    verified: false,
    avatar,
  };
}

function promoteUserToLiveHost(
  ctx: any,
  liveId: string,
  live: JsonRecord,
  targetUserId: string,
): void {
  const existingHosts = normalizeHostList(live.hosts);
  const alreadyHost = existingHosts.some((host) => readString(host.id) === targetUserId);
  const hosts = alreadyHost
    ? existingHosts
    : [...existingHosts, buildLiveHostFromProfile(ctx, targetUserId)];

  const nextLive = {
    ...live,
    hosts,
    images: hosts
      .map((host) => readString(host.avatar))
      .filter((value): value is string => Boolean(value)),
    updatedAt: nowMs(ctx),
  };
  writeLiveItem(ctx, liveId, nextLive);
  updateKnownLiveUsersFromHosts(ctx, hosts);

  upsertLivePresenceItem(ctx, targetUserId, {
    userId: targetUserId,
    activity: 'hosting',
    liveId,
    liveTitle: readString(live.title) ?? '',
    updatedAt: nowMs(ctx),
  });
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

  const existingSocial = readSocialUserItem(ctx, userId);
  const existingProfile = readUserProfileItem(ctx, userId);
  const identity = resolveProfileIdentityFields(payload, existingProfile, existingSocial);
  const avatarUrl =
    readString(payload.avatarUrl) ??
    readString(existingProfile.avatarUrl) ??
    readString(existingSocial.avatarUrl) ??
    '';
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

  const nextProfile = {
    ...existingProfile,
    ...payload,
    userId,
    username: identity.username,
    displayName: identity.displayName,
    name: identity.name,
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
    username: identity.username,
    name: identity.name,
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
  const existingProfile = readUserProfileItem(ctx, userId);
  const identity = resolveProfileIdentityFields(payload, existingProfile, existing);
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
    username: identity.username,
    name: identity.name,
    avatarUrl:
      readString(payload.avatarUrl) ??
      readString(existing.avatarUrl) ??
      readString(existingProfile.avatarUrl) ??
      '',
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

  const eventWidgetConfig = readEventWidgetConfig(ctx);
  const ownerUserId =
    readString(payload.ownerUserId) ?? readString(payload.hostUserId) ?? readString(payload.fromUserId);
  const title = readString(payload.title) ?? 'Live';
  const inviteOnly = readBoolean(payload.inviteOnly) ?? false;
  const now = nowMs(ctx);
  const eventDurationMs = eventWidgetConfig.drawDurationMinutes * 60_000;
  const hosts = normalizeHostList(payload.hosts);
  const bannedUserIds = normalizeBannedUserIds(payload.bannedUserIds);
  const invitedUserIds = normalizeInvitedUserIds(payload.invitedUserIds);
  const pendingHostRequestUserIds = normalizePendingHostRequestUserIds(
    payload.pendingHostRequestUserIds,
  );
  const pendingCoHostInviteUserIds = normalizePendingCoHostInviteUserIds(
    payload.pendingCoHostInviteUserIds,
  );

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
    pendingHostRequestUserIds,
    pendingCoHostInviteUserIds,
    boosted: false,
    totalBoosts: 0,
    boostRank: null,
    createdAt: now,
    updatedAt: now,
    event: {
      enabled: eventWidgetConfig.enabled && eventWidgetConfig.autoplayEnabled,
      drawIntervalMinutes: eventWidgetConfig.drawIntervalMinutes,
      durationHours: Math.max(1, Math.ceil(eventWidgetConfig.drawDurationMinutes / 60)),
      startedAt: now,
      endsAt: now + eventDurationMs,
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
    pendingHostRequestUserIds:
      payload.pendingHostRequestUserIds !== undefined
        ? normalizePendingHostRequestUserIds(payload.pendingHostRequestUserIds)
        : normalizePendingHostRequestUserIds(existing.pendingHostRequestUserIds),
    pendingCoHostInviteUserIds:
      payload.pendingCoHostInviteUserIds !== undefined
        ? normalizePendingCoHostInviteUserIds(payload.pendingCoHostInviteUserIds)
        : normalizePendingCoHostInviteUserIds(existing.pendingCoHostInviteUserIds),
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

  upsertEventParticipationItem(
    ctx,
    userId,
    liveId,
    activity === 'hosting' ? 'hosting' : 'watching',
  );
}

function applyLiveInvite(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
  invitedUserIds.add(targetUserId);
  const pendingCoHostInviteUserIds = new Set(
    normalizePendingCoHostInviteUserIds(live.pendingCoHostInviteUserIds),
  );
  pendingCoHostInviteUserIds.add(targetUserId);

  writeLiveItem(ctx, liveId, {
    ...live,
    invitedUserIds: Array.from(invitedUserIds),
    pendingCoHostInviteUserIds: Array.from(pendingCoHostInviteUserIds),
    updatedAt: nowMs(ctx),
  });
}

function applyLiveInviteResponse(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId) ?? readString(payload.responderUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const pendingCoHostInviteUserIds = new Set(
    normalizePendingCoHostInviteUserIds(live.pendingCoHostInviteUserIds),
  );
  if (!pendingCoHostInviteUserIds.has(targetUserId)) {
    return;
  }
  pendingCoHostInviteUserIds.delete(targetUserId);

  const accepted = readBooleanLike(payload.accepted) === true;
  if (!accepted) {
    writeLiveItem(ctx, liveId, {
      ...live,
      pendingCoHostInviteUserIds: Array.from(pendingCoHostInviteUserIds),
      updatedAt: nowMs(ctx),
    });
    return;
  }

  const pendingHostRequestUserIds = normalizePendingHostRequestUserIds(
    live.pendingHostRequestUserIds,
  ).filter((userId) => userId !== targetUserId);

  promoteUserToLiveHost(
    ctx,
    liveId,
    {
      ...live,
      pendingCoHostInviteUserIds: Array.from(pendingCoHostInviteUserIds),
      pendingHostRequestUserIds,
    },
    targetUserId,
  );
}

function applyLiveHostRequest(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const requesterUserId = readString(payload.requesterUserId);
  if (!liveId || !requesterUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;
  if (isLiveHostUser(live, requesterUserId)) return;

  const pendingHostRequestUserIds = new Set(
    normalizePendingHostRequestUserIds(live.pendingHostRequestUserIds),
  );
  pendingHostRequestUserIds.add(requesterUserId);

  writeLiveItem(ctx, liveId, {
    ...live,
    pendingHostRequestUserIds: Array.from(pendingHostRequestUserIds),
    updatedAt: nowMs(ctx),
  });
}

function applyLiveHostRequestResponse(ctx: any, payload: JsonRecord): void {
  const liveId = readString(payload.liveId);
  const targetUserId = readString(payload.targetUserId);
  if (!liveId || !targetUserId) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const pendingHostRequestUserIds = new Set(
    normalizePendingHostRequestUserIds(live.pendingHostRequestUserIds),
  );
  if (!pendingHostRequestUserIds.has(targetUserId)) {
    return;
  }
  pendingHostRequestUserIds.delete(targetUserId);

  const accepted = readBooleanLike(payload.accepted) === true;
  if (!accepted) {
    writeLiveItem(ctx, liveId, {
      ...live,
      pendingHostRequestUserIds: Array.from(pendingHostRequestUserIds),
      updatedAt: nowMs(ctx),
    });
    return;
  }

  const pendingCoHostInviteUserIds = normalizePendingCoHostInviteUserIds(
    live.pendingCoHostInviteUserIds,
  ).filter((userId) => userId !== targetUserId);

  const invitedUserIds = new Set(normalizeInvitedUserIds(live.invitedUserIds));
  invitedUserIds.add(targetUserId);

  promoteUserToLiveHost(
    ctx,
    liveId,
    {
      ...live,
      invitedUserIds: Array.from(invitedUserIds),
      pendingHostRequestUserIds: Array.from(pendingHostRequestUserIds),
      pendingCoHostInviteUserIds,
    },
    targetUserId,
  );
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
    invitedUserIds: normalizeInvitedUserIds(live.invitedUserIds).filter((id) => id !== targetUserId),
    pendingHostRequestUserIds: normalizePendingHostRequestUserIds(
      live.pendingHostRequestUserIds,
    ).filter((id) => id !== targetUserId),
    pendingCoHostInviteUserIds: normalizePendingCoHostInviteUserIds(
      live.pendingCoHostInviteUserIds,
    ).filter((id) => id !== targetUserId),
    viewers: Math.max(0, toNonNegativeInt(live.viewers) - 1),
    updatedAt: nowMs(ctx),
  });

  const presence = readLivePresenceItem(ctx, targetUserId);
  if (readString(presence.liveId) === liveId) {
    markLivePresenceBlocked(ctx, targetUserId, liveId);
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

  const publicPresence = ctx.db.publicLivePresenceItem.userId.find(targetUserId);
  if (
    readString(publicPresence?.liveId) === liveId &&
    readString(publicPresence?.activity) === 'blocked'
  ) {
    deleteLivePresenceItem(ctx, targetUserId);
  }
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
    pendingHostRequestUserIds: [],
    pendingCoHostInviteUserIds: [],
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

  const eventWidgetConfig = readEventWidgetConfig(ctx);
  if (!eventWidgetConfig.enabled) return;

  const live = readLiveItem(ctx, liveId);
  if (Object.keys(live).length === 0) return;

  const event = isRecord(live.event) ? live.event : {};
  const enabled = readBoolean(event.enabled) ?? eventWidgetConfig.autoplayEnabled;
  if (!enabled) return;

  const now = nowMs(ctx);
  const startedAt = toNonNegativeInt(event.startedAt, now);
  const endsAt = toNonNegativeInt(
    event.endsAt,
    startedAt + (eventWidgetConfig.drawDurationMinutes * 60_000),
  );
  const lastWinnerAt = toNonNegativeInt(event.lastWinnerAt);
  const intervalMinutes = Math.min(
    eventWidgetConfig.drawDurationMinutes,
    Math.max(
      EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN,
      toNonNegativeInt(event.drawIntervalMinutes, eventWidgetConfig.drawIntervalMinutes),
    ),
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

  if (eventType === 'live_invite_response') {
    applyLiveInviteResponse(ctx, payload);
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

export const setEventWidgetConfig = schemaDb.reducer(
  {
    entryAmountCash: t.option(t.u32()),
    drawDurationMinutes: t.option(t.u32()),
    drawIntervalMinutes: t.option(t.u32()),
    autoplayEnabled: t.option(t.bool()),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const argsRecord = args as JsonRecord;
    const entryAmountCashArg = args.entryAmountCash ?? argsRecord.entry_amount_cash;
    const drawDurationMinutesArg =
      args.drawDurationMinutes ?? argsRecord.draw_duration_minutes;
    const drawIntervalMinutesArg =
      args.drawIntervalMinutes ?? argsRecord.draw_interval_minutes;
    const autoplayEnabledArg = args.autoplayEnabled ?? argsRecord.autoplay_enabled;

    const hasAnyUpdate =
      entryAmountCashArg !== undefined ||
      drawDurationMinutesArg !== undefined ||
      drawIntervalMinutesArg !== undefined ||
      autoplayEnabledArg !== undefined;
    if (!hasAnyUpdate) {
      throw new Error(
        'At least one of entryAmountCash, drawDurationMinutes, drawIntervalMinutes, or autoplayEnabled is required.',
      );
    }

    const previousConfig = readEventWidgetConfig(ctx);
    const drawDurationMinutes = readBoundedIntPatch(
      drawDurationMinutesArg,
      previousConfig.drawDurationMinutes,
      EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN,
      EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX,
    );
    const drawIntervalMinutes = Math.min(
      drawDurationMinutes,
      readBoundedIntPatch(
        drawIntervalMinutesArg,
        previousConfig.drawIntervalMinutes,
        EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN,
        EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX,
      ),
    );

    const nextConfig: EventWidgetConfig = {
      ...previousConfig,
      entryAmountCash: readBoundedIntPatch(
        entryAmountCashArg,
        previousConfig.entryAmountCash,
        EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
        EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
      ),
      drawDurationMinutes,
      drawIntervalMinutes,
      autoplayEnabled: readBooleanPatch(autoplayEnabledArg, previousConfig.autoplayEnabled),
      updatedBy: adminUserId,
      updatedAtMs: nowMs(ctx),
    };

    writeEventWidgetConfig(ctx, nextConfig);
    appendEventWidgetConfigAudit(
      ctx,
      adminUserId,
      'event_widget_config_updated',
      previousConfig,
      nextConfig,
    );
  },
);

export const setEventWidgetEnabled = schemaDb.reducer(
  {
    enabled: t.bool(),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const previousConfig = readEventWidgetConfig(ctx);
    const nextConfig: EventWidgetConfig = {
      ...previousConfig,
      enabled: readBooleanLike(args.enabled) === true,
      updatedBy: adminUserId,
      updatedAtMs: nowMs(ctx),
    };

    writeEventWidgetConfig(ctx, nextConfig);
    appendEventWidgetConfigAudit(
      ctx,
      adminUserId,
      nextConfig.enabled ? 'event_widget_enabled' : 'event_widget_disabled',
      previousConfig,
      nextConfig,
    );
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

export const trackProfileView = schemaDb.reducer(
  {
    id: t.string(),
    viewerUserId: t.string(),
    profileUserId: t.string(),
    occurredAtMs: t.option(t.string()),
    source: t.option(t.string()),
    dedupeWindowMs: t.option(t.u32()),
  },
  (ctx, args) => {
    assertSelf(ctx, args.viewerUserId, 'viewerUserId');
    const eventId = readString(args.id);
    if (!eventId) {
      throw new Error('id is required.');
    }

    applyTrackProfileViewV2(ctx, {
      id: eventId,
      viewerUserId: args.viewerUserId,
      profileUserId: args.profileUserId,
      occurredAtMs: readString(args.occurredAtMs),
      source: readString(args.source),
      dedupeWindowMs: args.dedupeWindowMs,
      createdAt: nowMs(ctx),
    });
  },
);

export const setProfileViewMetricCutover = schemaDb.reducer(
  {
    activeVersion: t.option(t.string()),
    cutoverAtMs: t.option(t.string()),
    dedupeWindowMs: t.option(t.u32()),
    migrationMode: t.option(t.string()),
    notes: t.option(t.string()),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const existing = ensureProfileViewMetricCutoverState(ctx, adminUserId);
    const nextActiveVersion = readString(args.activeVersion) ?? existing.activeVersion;
    if (
      nextActiveVersion !== PROFILE_VIEW_METRIC_VERSION_V2 &&
      nextActiveVersion !== 'legacy'
    ) {
      throw new Error('activeVersion must be "legacy" or "v2".');
    }

    const nextCutoverAtMs = toNonNegativeInt(args.cutoverAtMs, existing.cutoverAtMs);
    const nextDedupeWindowMs = normalizeProfileViewDedupeWindowMs(
      args.dedupeWindowMs ?? existing.dedupeWindowMs,
    );
    const nextMigrationMode =
      readString(args.migrationMode) ?? existing.migrationMode ?? PROFILE_VIEW_DEFAULT_MIGRATION_MODE;
    const nextNotes = readString(args.notes) ?? existing.notes;

    upsertProfileViewMetricCutoverItem(ctx, {
      activeVersion: nextActiveVersion,
      cutoverAtMs: nextCutoverAtMs,
      dedupeWindowMs: nextDedupeWindowMs,
      migrationMode: nextMigrationMode,
      notes: nextNotes,
      updatedBy: adminUserId,
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

    try {
      authorizeLivePresencePayload(ctx, payload);
    } catch (error) {
      const userId = readString(payload.userId);
      const liveId = readString(payload.liveId);
      const failureMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();

      if (userId && liveId && (failureMessage.includes("you're banned") || failureMessage.includes('you are banned'))) {
        markLivePresenceBlocked(ctx, userId, liveId);
        console.info('[live_presence] ignored_rejected_presence', {
          code: 'banned',
          userId,
          liveId,
        });
        return;
      }

      if (userId && (failureMessage.includes('has ended') || failureMessage.includes('already ended'))) {
        deleteLivePresenceItem(ctx, userId);
        console.info('[live_presence] ignored_rejected_presence', {
          code: 'live_ended',
          userId,
          liveId: liveId ?? null,
        });
        return;
      }

      throw error;
    }
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
    try {
      routeGlobalMessage(ctx, args.id, args.roomId, args.item);
    } catch (error) {
      const roomId = readString(args.roomId) ?? 'global';
      const liveRoom = parseLiveRoomId(roomId);
      if (!liveRoom) {
        throw error;
      }

      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      const code = message.includes("you're banned") || message.includes('you are banned')
        ? 'banned'
        : message.includes('invite only')
          ? 'invite_only'
          : message.includes('has ended') || message.includes('already ended')
            ? 'live_ended'
            : null;

      if (!code) {
        throw error;
      }

      const payload = parseJsonRecord(args.item);
      console.info('[live_chat] ignored_rejected_message', {
        code,
        roomId,
        senderId: readString(payload.senderId) ?? null,
      });
    }
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

export const submitReport = schemaDb.reducer(
  {
    id: t.option(t.string()),
    targetType: t.string(),
    targetId: t.string(),
    surface: t.string(),
    reason: t.string(),
    details: t.option(t.string()),
    contextJson: t.option(t.string()),
  },
  (ctx, args) => {
    const reporterUserId = resolveCallerUserId(ctx);
    const targetType = readReportTargetType(args.targetType);
    const targetId = normalizeOptionalText(args.targetId, 200);
    const surface = normalizeOptionalText(args.surface, 80);
    const reason = normalizeOptionalText(args.reason, REPORT_REASON_MAX_LENGTH);
    const details = normalizeOptionalText(args.details, REPORT_DETAILS_MAX_LENGTH);
    const clientContext = parseJsonRecord(args.contextJson);

    if (!targetId) {
      throw new Error('targetId is required.');
    }
    if (!surface) {
      throw new Error('surface is required.');
    }
    if (!reason) {
      throw new Error('reason is required.');
    }

    const dedupeKey = buildReportDedupeKey({
      reporterUserId,
      targetType,
      targetId,
      surface,
      reason,
    });
    const decision = evaluateReportSubmissionPolicy({
      reporterUserId,
      dedupeKey,
      nowMs: nowMs(ctx),
      existingReports: listExistingReportPolicyRecords(ctx),
    });
    if (!decision.allowed) {
      unauthorized(decision.message);
    }

    const derivedContext = buildReportModerationContext(ctx, {
      targetType,
      targetId,
      surface,
      clientContext,
    });
    const reportedUserId =
      derivedContext.reportedUserId ??
      normalizeOptionalText(clientContext.reportedUserId, 200);
    const contextJson = toJsonString({
      ...derivedContext.context,
      reportedUserId,
    });
    if (contextJson.length > REPORT_CONTEXT_MAX_LENGTH) {
      throw new Error(`Report context exceeds ${REPORT_CONTEXT_MAX_LENGTH} characters.`);
    }

    const reportId = normalizeOptionalText(args.id, 200) ?? makeId(ctx, 'report');
    upsertReportRow(ctx, {
      id: reportId,
      reporterUserId,
      targetType,
      targetId,
      reportedUserId,
      surface,
      reason,
      details,
      contextJson,
      status: 'open',
      reviewedBy: null,
      reviewNotes: null,
      reviewedAtIsoUtc: null,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });

    appendReportModerationAction(ctx, {
      actionType: 'report_submitted',
      actorUserId: reporterUserId,
      reportId,
      targetUserId: reportedUserId,
      payload: {
        status: 'open',
        targetType,
        targetId,
        surface,
        reason,
        details,
      },
    });
  },
);

export const reviewReport = schemaDb.reducer(
  {
    reportId: t.string(),
    status: t.string(),
    reviewNotes: t.option(t.string()),
  },
  (ctx, args) => {
    const adminUserId = assertAdmin(ctx);
    const reportId = normalizeOptionalText(args.reportId, 200);
    const nextStatus = normalizeReportStatus(args.status);
    const nextReviewNotes = normalizeOptionalText(args.reviewNotes, REPORT_DETAILS_MAX_LENGTH);

    if (!reportId) {
      throw new Error('reportId is required.');
    }
    if (!nextStatus) {
      throw new Error('status must be one of: open, triaged, resolved, dismissed.');
    }

    const existing = readReportRow(ctx, reportId);
    if (!existing) {
      throw new Error(`report_not_found:${reportId}`);
    }

    const previousStatus = readString(existing.status) ?? 'open';
    const previousReviewNotes = readString(existing.reviewNotes);
    if (previousStatus === nextStatus && previousReviewNotes === nextReviewNotes) {
      throw new Error('Report review update must change status or notes.');
    }

    upsertReportRow(ctx, {
      id: readString(existing.id) ?? reportId,
      reporterUserId: readString(existing.reporterUserId) ?? '',
      targetType: readString(existing.targetType) ?? '',
      targetId: readString(existing.targetId) ?? '',
      reportedUserId: readString(existing.reportedUserId),
      surface: readString(existing.surface) ?? '',
      reason: readString(existing.reason) ?? '',
      details: readString(existing.details),
      contextJson: readString(existing.contextJson) ?? '{}',
      status: nextStatus,
      reviewedBy: adminUserId,
      reviewNotes: nextReviewNotes,
      reviewedAtIsoUtc: new Date(nowMs(ctx)).toISOString(),
      createdAt: existing.createdAt ?? ctx.timestamp,
      updatedAt: ctx.timestamp,
    });

    appendReportModerationAction(ctx, {
      actionType: 'report_reviewed',
      actorUserId: adminUserId,
      reportId,
      targetUserId: readString(existing.reportedUserId),
      payload: {
        previousStatus,
        nextStatus,
        reviewNotes: nextReviewNotes,
        targetType: readString(existing.targetType),
        targetId: readString(existing.targetId),
        surface: readString(existing.surface),
      },
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
