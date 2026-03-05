import { schema, table, t } from 'spacetimedb/server';

type PublicProfileSummaryViewRow = {
    userId: string;
    username: string;
    avatarUrl: string;
    badge: string | undefined;
    spotlightStatus: string | undefined;
};

type PublicLeaderboardViewRow = {
    userId: string;
    score: number;
    gold: number;
    gems: number;
};

type PublicLiveDiscoveryViewRow = {
    liveId: string;
    hostUserId: string | undefined;
    hostUsername: string | undefined;
    hostAvatarUrl: string | undefined;
    title: string;
    viewerCount: number;
};

const PROFILE_VIEW_METRIC_NAME = 'profile_views';
const PROFILE_VIEW_METRIC_LABEL_LEGACY = 'Legacy (pre-cutover)';
const PROFILE_VIEW_METRIC_LABEL_V2 = 'Corrected v2 (deduped, self-view excluded)';

const CURRENT_IDENTITY_PROVIDER = 'clerk';
const EVENT_METRICS_TIMEZONE = 'UTC';
const EVENT_ACTIVE_WINDOW_MS = 120_000;
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

function readString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readIdentityString(value: unknown): string | null {
    const direct = readString(value);
    if (direct) return direct;

    if (!value || typeof value !== 'object') return null;

    const withHex = value as { toHexString?: () => unknown };
    if (typeof withHex.toHexString === 'function') {
        const hex = readIdentityString(withHex.toHexString());
        if (hex) return hex;
    }

    const withString = value as { toString?: () => unknown };
    if (typeof withString.toString === 'function') {
        const text = readIdentityString(withString.toString());
        if (text && text !== '[object Object]') return text;
    }

    return null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string' || value.trim().length === 0) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
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

function readBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function readIsoMs(value: unknown): number | null {
    const directNumber = readNumber(value);
    if (directNumber !== null) {
        return directNumber;
    }

    const isoValue = readString(value);
    if (!isoValue) return null;

    const parsed = Date.parse(isoValue);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoUtc(valueMs: number): string {
    try {
        return new Date(valueMs).toISOString();
    } catch {
        return new Date().toISOString();
    }
}

function startOfUtcDayMs(valueMs: number): number {
    const date = new Date(valueMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcIsoWeekMs(valueMs: number): number {
    const date = new Date(valueMs);
    const dayOfWeek = date.getUTCDay();
    const offsetToMonday = (dayOfWeek + 6) % 7;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offsetToMonday);
}

function startOfUtcMonthMs(valueMs: number): number {
    const date = new Date(valueMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function readLiveEventEnabled(liveItemValue: unknown, nowMs: number): boolean {
    const liveItem = parseJsonRecord(liveItemValue);
    const event = liveItem.event;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return false;
    }

    const eventRecord = event as Record<string, unknown>;
    const enabled = readBoolean(eventRecord.enabled);
    if (enabled === false) {
        return false;
    }

    const endedAtMs = toNonNegativeInt(eventRecord.endedAt);
    if (endedAtMs > 0 && endedAtMs <= nowMs) {
        return false;
    }

    return true;
}

function readGlobalEventWidgetEnabled(ctx: any): boolean {
    const row = ctx?.db?.eventWidgetConfigItem?.id?.find?.('global');
    const enabled = readBoolean((row as Record<string, unknown> | undefined)?.enabled);
    return enabled !== false;
}

function timestampToMs(value: unknown): number {
    const direct = readNumber(value);
    if (direct !== null) return direct;

    if (value && typeof value === 'object') {
        const withToMillis = value as { toMillis?: () => unknown };
        if (typeof withToMillis.toMillis === 'function') {
            const millis = readNumber(withToMillis.toMillis());
            if (millis !== null) return millis;
        }

        const withMicros = value as {
            microsSinceUnixEpoch?: unknown;
            __timestamp_micros_since_unix_epoch__?: unknown;
        };
        const micros = readNumber(
            withMicros.microsSinceUnixEpoch ?? withMicros.__timestamp_micros_since_unix_epoch__,
        );
        if (micros !== null) {
            return Math.floor(micros / 1000);
        }
    }

    return Date.now();
}

function readWalletBalancesFromState(stateValue: unknown): {
    gems: number;
    cash: number;
    fuel: number;
} {
    const state = parseJsonRecord(stateValue);
    const wallet = state.wallet;
    if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) {
        return { gems: 0, cash: 0, fuel: 0 };
    }

    const walletRecord = wallet as Record<string, unknown>;
    return {
        gems: toNonNegativeInt(walletRecord.gems),
        cash: toNonNegativeInt(walletRecord.cash),
        fuel: toNonNegativeInt(walletRecord.fuel),
    };
}

function readJwtClaims(ctx: any): Record<string, unknown> | null {
    const claims = ctx?.senderAuth?.jwt?.fullPayload;
    return claims && typeof claims === 'object' && !Array.isArray(claims)
        ? claims as Record<string, unknown>
        : null;
}

function readClaimPath(claims: Record<string, unknown>, path: readonly string[]): unknown {
    let current: unknown = claims;
    for (const segment of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            return null;
        }
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function readLegacyCallerUserIdFromClaims(ctx: any): string | null {
    const claims = readJwtClaims(ctx);
    if (!claims) return null;

    for (const path of LEGACY_CALLER_USER_ID_CLAIM_PATHS) {
        const candidate = readString(readClaimPath(claims, path));
        if (candidate) {
            return candidate;
        }
    }

    return null;
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

function buildIdentityLookupKey(provider: string, issuer: string, subject: string): string {
    return `${provider.trim().toLowerCase()}::${issuer.trim()}::${subject.trim()}`;
}

function findMappedCallerUserId(ctx: any): string | null {
    const authIdentity = readCallerAuthIdentity(ctx);
    const lookupFind = ctx?.db?.userIdentity?.lookupKey?.find;
    if (!authIdentity || typeof lookupFind !== 'function') {
        return null;
    }

    const row = lookupFind(
        buildIdentityLookupKey(
            CURRENT_IDENTITY_PROVIDER,
            authIdentity.issuer,
            authIdentity.subject,
        ),
    );
    return readString(row?.vuluUserId);
}

function requireViewCallerUserId(ctx: any): string {
    const callerUserId =
        findMappedCallerUserId(ctx) ??
        readLegacyCallerUserIdFromClaims(ctx) ??
        readCallerAuthIdentity(ctx)?.subject ??
        readIdentityString(ctx.sender);
    if (callerUserId) return callerUserId;
    throw new Error('Unauthorized: caller identity could not be resolved in view context.');
}

export const spacetimedb = schema({
    socialUserItem: table(
        { public: false },
        {
            userId: t.string().primaryKey(),
            item: t.string(), // serialized json
            updatedAt: t.timestamp(), // timestamp ms
        }
    ),
    accountStateItem: table(
        { public: false },
        {
            userId: t.string().primaryKey(),
            state: t.string(), // serialized json
            updatedAt: t.timestamp(),
        }
    ),
    adminWalletCreditTransaction: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            adminUserId: t.string().index(),
            targetUserId: t.string().index(),
            deltaGems: t.u32(),
            deltaCash: t.u32(),
            deltaFuel: t.u32(),
            reason: t.string(),
            balanceBefore: t.string(), // json
            balanceAfter: t.string(), // json
            metadata: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    walletTransactionItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            userId: t.string().index(),
            eventType: t.string(),
            deltaGems: t.i32(),
            deltaCash: t.i32(),
            deltaFuel: t.i32(),
            balanceBefore: t.string(), // json
            balanceAfter: t.string(), // json
            metadata: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    eventParticipationItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            liveId: t.string().index(),
            userId: t.string().index(),
            dayBucketStartIsoUtc: t.string().index(),
            activity: t.string(),
            source: t.string(),
            firstSeenAtIsoUtc: t.string(),
            lastSeenAtIsoUtc: t.string(),
        }
    ),
    auditLogItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            actorUserId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    eventWidgetConfigItem: table(
        { public: true },
        {
            id: t.string().primaryKey(),
            enabled: t.bool(),
            entryAmountCash: t.u32(),
            drawDurationMinutes: t.u32(),
            drawIntervalMinutes: t.u32(),
            autoplayEnabled: t.bool(),
            updatedBy: t.string(),
            updatedAt: t.timestamp(),
        }
    ),
    eventWidgetConfigAuditItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            action: t.string(),
            actorUserId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    moderationActionItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            actorUserId: t.string().index(),
            targetUserId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    withdrawalRequestItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            userId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    users: table(
        { public: false },
        {
            vuluUserId: t.string().primaryKey(),
            createdAt: t.timestamp(),
            displayName: t.string(),
            avatar: t.option(t.string()),
            isBanned: t.bool(),
            banStatus: t.string(),
            banReason: t.option(t.string()),
        }
    ),
    userIdentity: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            vuluUserId: t.string().index(),
            provider: t.string(),
            issuer: t.string(),
            subject: t.string(),
            email: t.option(t.string()),
            emailVerified: t.bool(),
            lookupKey: t.string().unique(),
            createdAt: t.timestamp(),
        }
    ),
    userRole: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            vuluUserId: t.string().index(),
            role: t.string(),
            grantedAt: t.timestamp(),
            grantedBy: t.option(t.string()),
        }
    ),
    userProfileItem: table(
        { public: false },
        {
            userId: t.string().primaryKey(),
            profile: t.string(), // json
            updatedAt: t.timestamp(),
        }
    ),
    publicProfileSummaryItem: table(
        { public: true },
        {
            userId: t.string().primaryKey(),
            username: t.string(),
            avatarUrl: t.string(),
            badge: t.option(t.string()),
            spotlightStatus: t.option(t.string()),
        }
    ),
    publicLeaderboardItem: table(
        { public: false },
        {
            userId: t.string().primaryKey(),
            score: t.u32(),
            gold: t.u32(),
            gems: t.u32(),
        }
    ),
    publicLiveDiscoveryItem: table(
        { public: false },
        {
            liveId: t.string().primaryKey(),
            hostUserId: t.option(t.string()),
            hostUsername: t.option(t.string()),
            hostAvatarUrl: t.option(t.string()),
            title: t.string(),
            viewerCount: t.u32(),
        }
    ),
    friendship: table(
        {
            public: false,
        },
        {
            pairKey: t.string().primaryKey(),
            userLowId: t.string().index(),
            userHighId: t.string().index(),
            status: t.string(), // 'pending', 'accepted', 'declined', 'blocked'
            requestedBy: t.option(t.string()),
            updatedAt: t.timestamp(),
        }
    ),
    conversationItem: table(
        {
            public: false,
        },
        {
            // PG used composite primary key (owner_user_id, other_user_id)
            id: t.string().primaryKey(),
            ownerUserId: t.string().index(),
            otherUserId: t.string().index(),
            item: t.string(), // json
            updatedAt: t.timestamp(),
        }
    ),
    threadSeedMessage: table(
        {
            public: false,
        },
        {
            id: t.string().primaryKey(), // composite key derived
            ownerUserId: t.string().index(),
            otherUserId: t.string().index(),
            messages: t.string(), // json array
            updatedAt: t.timestamp(),
        }
    ),
    globalMessageItem: table(
        {
            public: true,
        },
        {
            id: t.string().primaryKey(),
            roomId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    mentionUserItem: table(
        { public: true },
        {
            id: t.string().primaryKey(),
            item: t.string(), // json
            updatedAt: t.timestamp(),
        }
    ),
    notificationItem: table(
        {
            public: false,
        },
        {
            id: t.string().primaryKey(),
            userId: t.string().index(),
            item: t.string(), // json
            createdAt: t.timestamp(),
        }
    ),
    profileViewMetricCutoverItem: table(
        { public: false },
        {
            metricName: t.string().primaryKey(),
            activeVersion: t.string(),
            cutoverAtMs: t.string(),
            dedupeWindowMs: t.u32(),
            migrationMode: t.string(),
            notes: t.option(t.string()),
            updatedBy: t.option(t.string()),
            updatedAt: t.timestamp(),
        }
    ),
    profileViewAttemptV2Item: table(
        { public: false },
        {
            id: t.string().primaryKey(),
            viewerUserId: t.string().index(),
            profileUserId: t.string().index(),
            metricVersion: t.string(),
            occurredAtMs: t.string(),
            dedupeWindowMs: t.u32(),
            counted: t.bool(),
            dropReason: t.option(t.string()),
            source: t.option(t.string()),
            createdAt: t.timestamp(),
        }
    ),
    profileViewDedupeStateV2Item: table(
        { public: false },
        {
            key: t.string().primaryKey(),
            viewerUserId: t.string().index(),
            profileUserId: t.string().index(),
            lastCountedAtMs: t.string(),
            lastEventId: t.string(),
            updatedAt: t.timestamp(),
        }
    ),
    profileViewAggregateV2Item: table(
        { public: false },
        {
            profileUserId: t.string().primaryKey(),
            countedTotal: t.u32(),
            uniqueViewerTotal: t.u32(),
            lastCountedAtMs: t.string(),
            updatedAt: t.timestamp(),
        }
    ),
    profileViewUniqueViewerV2Item: table(
        { public: false },
        {
            key: t.string().primaryKey(),
            profileUserId: t.string().index(),
            viewerUserId: t.string().index(),
            firstCountedAtMs: t.string(),
            lastCountedAtMs: t.string(),
            viewCount: t.u32(),
            updatedAt: t.timestamp(),
        }
    ),
    liveItem: table({ public: false }, { id: t.string().primaryKey(), item: t.string(), updatedAt: t.timestamp() }),
    liveBoostLeaderboardItem: table({ public: true }, { id: t.string().primaryKey(), item: t.string(), updatedAt: t.timestamp() }),
    knownLiveUserItem: table({ public: true }, { id: t.string().primaryKey(), item: t.string(), updatedAt: t.timestamp() }),
    publicLivePresenceItem: table(
        { public: true },
        {
            userId: t.string().primaryKey(),
            liveId: t.string().index(),
            activity: t.string(),
            updatedAt: t.timestamp(),
        }
    ),
    livePresenceItem: table(
        {
            public: false,
        },
        {
            userId: t.string().primaryKey(),
            liveId: t.option(t.string()),
            item: t.string(),
            updatedAt: t.timestamp(),
        }
    ),
    leaderboardItem: table({ public: false }, { id: t.string().primaryKey(), item: t.string(), updatedAt: t.timestamp() }),
    videoItem: table({ public: true }, { id: t.string().primaryKey(), item: t.string(), updatedAt: t.timestamp() }),

    // Media tables
    artist: table(
        { public: true },
        {
            id: t.string().primaryKey(),
            name: t.string(),
            imageUrl: t.option(t.string()),
            createdAt: t.timestamp(),
        }
    ),
    track: table(
        { public: true },
        {
            id: t.string().primaryKey(),
            title: t.string(),
            artistId: t.option(t.string()),
            artworkUrl: t.option(t.string()),
            durationSeconds: t.u32(),
            audioUrl: t.option(t.string()),
            createdAt: t.timestamp(),
        }
    ),
    playlist: table(
        { public: true },
        {
            id: t.string().primaryKey(),
            title: t.string(),
            description: t.option(t.string()),
            coverUrl: t.option(t.string()),
            createdAt: t.timestamp(),
        }
    ),
    playlistTrack: table(
        { public: true },
        {
            id: t.string().primaryKey(), // Derived composite: playlistId::trackId
            playlistId: t.string().index(),
            trackId: t.string().index(),
            position: t.u32(),
        }
    ),
});

const publicProfileSummaryRow = t.row('PublicProfileSummaryRow', {
    userId: t.string(),
    username: t.string(),
    avatarUrl: t.string(),
    badge: t.option(t.string()),
    spotlightStatus: t.option(t.string()),
});

const publicLeaderboardRow = t.row('PublicLeaderboardRow', {
    userId: t.string(),
    score: t.u32(),
    gold: t.u32(),
    gems: t.u32(),
});

const publicLiveDiscoveryRow = t.row('PublicLiveDiscoveryRow', {
    liveId: t.string(),
    hostUserId: t.option(t.string()),
    hostUsername: t.option(t.string()),
    hostAvatarUrl: t.option(t.string()),
    title: t.string(),
    viewerCount: t.u32(),
});

const eventMetricsOverviewRow = t.row('EventMetricsOverviewRow', {
    bucketTimezone: t.string(),
    asOfIsoUtc: t.string(),
    todayStartIsoUtc: t.string(),
    weekStartIsoUtc: t.string(),
    monthStartIsoUtc: t.string(),
    activeWindowMs: t.u32(),
    activePlayersNow: t.u32(),
    totalPlayersToday: t.u32(),
    totalPlayersWeek: t.u32(),
    totalPlayersMonth: t.u32(),
    totalEntriesToday: t.u32(),
    totalEntriesWeek: t.u32(),
    totalEntriesMonth: t.u32(),
});

const myAccountStateRow = t.row('MyAccountStateRow', {
    userId: t.string(),
    state: t.string(),
    updatedAt: t.timestamp(),
});

const myWalletBalanceRow = t.row('MyWalletBalanceRow', {
    userId: t.string(),
    gems: t.u32(),
    cash: t.u32(),
    fuel: t.u32(),
    updatedAt: t.timestamp(),
});

const myWalletTransactionRow = t.row('MyWalletTransactionRow', {
    id: t.string(),
    userId: t.string(),
    eventType: t.string(),
    deltaGems: t.i32(),
    deltaCash: t.i32(),
    deltaFuel: t.i32(),
    balanceBefore: t.string(),
    balanceAfter: t.string(),
    metadata: t.string(),
    createdAt: t.timestamp(),
});

const myNotificationRow = t.row('MyNotificationRow', {
    id: t.string(),
    userId: t.string(),
    item: t.string(),
    createdAt: t.timestamp(),
});

const myFriendshipRow = t.row('MyFriendshipRow', {
    pairKey: t.string(),
    userLowId: t.string(),
    userHighId: t.string(),
    status: t.string(),
    requestedBy: t.option(t.string()),
    updatedAt: t.timestamp(),
});

const myConversationRow = t.row('MyConversationRow', {
    id: t.string(),
    ownerUserId: t.string(),
    otherUserId: t.string(),
    item: t.string(),
    updatedAt: t.timestamp(),
});

const myConversationMessageRow = t.row('MyConversationMessageRow', {
    id: t.string(),
    ownerUserId: t.string(),
    otherUserId: t.string(),
    messages: t.string(),
    updatedAt: t.timestamp(),
});

const myProfileRow = t.row('MyProfileRow', {
    userId: t.string(),
    profile: t.string(),
    updatedAt: t.timestamp(),
});

const myIdentityRow = t.row('MyIdentityRow', {
    id: t.string(),
    vuluUserId: t.string(),
    provider: t.string(),
    issuer: t.string(),
    subject: t.string(),
    email: t.option(t.string()),
    emailVerified: t.bool(),
    createdAt: t.timestamp(),
});

const myRoleRow = t.row('MyRoleRow', {
    id: t.string(),
    vuluUserId: t.string(),
    role: t.string(),
    grantedAt: t.timestamp(),
    grantedBy: t.option(t.string()),
});

const myProfileViewMetricsRow = t.row('MyProfileViewMetricsRow', {
    userId: t.string(),
    activeMetricVersion: t.string(),
    dedupeWindowMs: t.u32(),
    cutoverAtMs: t.string(),
    correctedTotalCount: t.u32(),
    correctedUniqueViewerCount: t.u32(),
    legacyPreCutoverNotificationCount: t.u32(),
    legacyLabel: t.string(),
    correctedLabel: t.string(),
    updatedAt: t.timestamp(),
});

export const publicProfileSummary = spacetimedb.anonymousView(
    { name: 'public_profile_summary', public: true },
    t.array(publicProfileSummaryRow),
    (ctx) => ctx.from.publicProfileSummaryItem.build(),
);

export const publicLeaderboard = spacetimedb.anonymousView(
    { name: 'public_leaderboard', public: true },
    t.array(publicLeaderboardRow),
    (ctx) => ctx.from.publicLeaderboardItem.build(),
);

export const publicLiveDiscovery = spacetimedb.anonymousView(
    { name: 'public_live_discovery', public: true },
    t.array(publicLiveDiscoveryRow),
    (ctx) => ctx.from.publicLiveDiscoveryItem.build(),
);

export const eventMetricsOverview = spacetimedb.view(
    { name: 'event_metrics_overview', public: true },
    t.array(eventMetricsOverviewRow),
    (ctx) => {
        const nowMs = Date.now();
        const todayStartMs = startOfUtcDayMs(nowMs);
        const weekStartMs = startOfUtcIsoWeekMs(nowMs);
        const monthStartMs = startOfUtcMonthMs(nowMs);
        const activeThresholdMs = nowMs - EVENT_ACTIVE_WINDOW_MS;

        const eventEnabledLiveIds = new Set<string>();
        if (readGlobalEventWidgetEnabled(ctx)) {
            for (const row of ctx.db.liveItem.iter()) {
                if (readLiveEventEnabled(row.item, nowMs)) {
                    eventEnabledLiveIds.add(row.id);
                }
            }
        }

        const activePlayers = new Set<string>();
        for (const row of ctx.db.livePresenceItem.iter()) {
            const userId = readString(row.userId);
            const liveId = readString(row.liveId);
            if (!userId || !liveId || !eventEnabledLiveIds.has(liveId)) {
                continue;
            }

            const updatedAtMs = readIsoMs(parseJsonRecord(row.item).updatedAt) ?? nowMs;
            if (updatedAtMs >= activeThresholdMs) {
                activePlayers.add(userId);
            }
        }

        let totalEntriesToday = 0;
        let totalEntriesWeek = 0;
        let totalEntriesMonth = 0;
        const uniquePlayersToday = new Set<string>();
        const uniquePlayersWeek = new Set<string>();
        const uniquePlayersMonth = new Set<string>();

        for (const row of ctx.db.eventParticipationItem.iter()) {
            const userId = readString(row.userId);
            const dayBucketStartMs = readIsoMs(row.dayBucketStartIsoUtc);
            if (!userId || dayBucketStartMs === null) {
                continue;
            }

            if (dayBucketStartMs >= monthStartMs) {
                totalEntriesMonth += 1;
                uniquePlayersMonth.add(userId);
            }

            if (dayBucketStartMs >= weekStartMs) {
                totalEntriesWeek += 1;
                uniquePlayersWeek.add(userId);
            }

            if (dayBucketStartMs >= todayStartMs) {
                totalEntriesToday += 1;
                uniquePlayersToday.add(userId);
            }
        }

        return [
            {
                bucketTimezone: EVENT_METRICS_TIMEZONE,
                asOfIsoUtc: toIsoUtc(nowMs),
                todayStartIsoUtc: toIsoUtc(todayStartMs),
                weekStartIsoUtc: toIsoUtc(weekStartMs),
                monthStartIsoUtc: toIsoUtc(monthStartMs),
                activeWindowMs: EVENT_ACTIVE_WINDOW_MS,
                activePlayersNow: activePlayers.size,
                totalPlayersToday: uniquePlayersToday.size,
                totalPlayersWeek: uniquePlayersWeek.size,
                totalPlayersMonth: uniquePlayersMonth.size,
                totalEntriesToday,
                totalEntriesWeek,
                totalEntriesMonth,
            },
        ];
    },
);

export const myAccountState = spacetimedb.view(
    { name: 'my_account_state', public: true },
    t.array(myAccountStateRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.accountStateItem.where((row) => row.userId.eq(callerUserId)).build();
    },
);

export const myWalletBalance = spacetimedb.view(
    { name: 'my_wallet_balance', public: true },
    t.array(myWalletBalanceRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        const accountState = ctx.db.accountStateItem.userId.find(callerUserId);
        if (!accountState) {
            return [];
        }

        const wallet = readWalletBalancesFromState(accountState.state);
        return [
            {
                userId: callerUserId,
                gems: wallet.gems,
                cash: wallet.cash,
                fuel: wallet.fuel,
                updatedAt: accountState.updatedAt,
            },
        ];
    },
);

export const myWalletTransactions = spacetimedb.view(
    { name: 'my_wallet_transactions', public: true },
    t.array(myWalletTransactionRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.walletTransactionItem.where((row) => row.userId.eq(callerUserId)).build();
    },
);

export const myProfile = spacetimedb.view(
    { name: 'my_profile', public: true },
    t.array(myProfileRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.userProfileItem.where((row) => row.userId.eq(callerUserId)).build();
    },
);

export const myNotifications = spacetimedb.view(
    { name: 'my_notifications', public: true },
    t.array(myNotificationRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.notificationItem.where((row) => row.userId.eq(callerUserId)).build();
    },
);

export const myFriendships = spacetimedb.view(
    { name: 'my_friendships', public: true },
    t.array(myFriendshipRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.friendship.where((row) =>
            row.userLowId.eq(callerUserId).or(row.userHighId.eq(callerUserId))
        ).build();
    },
);

export const myConversations = spacetimedb.view(
    { name: 'my_conversations', public: true },
    t.array(myConversationRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.conversationItem.where((row) =>
            row.ownerUserId.eq(callerUserId).or(row.otherUserId.eq(callerUserId))
        ).build();
    },
);

export const myConversationMessages = spacetimedb.view(
    { name: 'my_conversation_messages', public: true },
    t.array(myConversationMessageRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.threadSeedMessage.where((row) =>
            row.ownerUserId.eq(callerUserId).or(row.otherUserId.eq(callerUserId))
        ).build();
    },
);

export const myIdentity = spacetimedb.view(
    { name: 'my_identity', public: true },
    t.array(myIdentityRow),
    (ctx) => {
        const authIdentity = readCallerAuthIdentity(ctx);
        if (!authIdentity) {
            return [];
        }

        const lookupKey = buildIdentityLookupKey(
            CURRENT_IDENTITY_PROVIDER,
            authIdentity.issuer,
            authIdentity.subject,
        );
        const row = ctx.db.userIdentity.lookupKey.find(lookupKey);
        if (!row) {
            return [];
        }

        return [
            {
                id: row.id,
                vuluUserId: row.vuluUserId,
                provider: row.provider,
                issuer: row.issuer,
                subject: row.subject,
                email: row.email,
                emailVerified: row.emailVerified,
                createdAt: row.createdAt,
            },
        ];
    },
);

export const myRoles = spacetimedb.view(
    { name: 'my_roles', public: true },
    t.array(myRoleRow),
    (ctx) => {
        const callerUserId = findMappedCallerUserId(ctx) ?? readLegacyCallerUserIdFromClaims(ctx);
        if (!callerUserId) {
            return [];
        }

        const rows = [];
        for (const row of ctx.db.userRole.iter()) {
            if (row.vuluUserId !== callerUserId) {
                continue;
            }

            rows.push({
                id: row.id,
                vuluUserId: row.vuluUserId,
                role: row.role,
                grantedAt: row.grantedAt,
                grantedBy: row.grantedBy,
            });
        }

        return rows;
    },
);

export const myProfileViewMetrics = spacetimedb.view(
    { name: 'my_profile_view_metrics', public: true },
    t.array(myProfileViewMetricsRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        const cutover =
            ctx.db.profileViewMetricCutoverItem.metricName.find(PROFILE_VIEW_METRIC_NAME) ??
            null;

        const activeMetricVersion = readString(cutover?.activeVersion) ?? 'v2';
        const dedupeWindowMs = Math.max(0, toNonNegativeInt(cutover?.dedupeWindowMs, 30 * 60 * 1000));
        const cutoverAtMs = Math.max(0, toNonNegativeInt(cutover?.cutoverAtMs, 0));
        const corrected = ctx.db.profileViewAggregateV2Item.profileUserId.find(callerUserId);
        const correctedTotalCount = Math.max(0, toNonNegativeInt(corrected?.countedTotal, 0));
        const correctedUniqueViewerCount = Math.max(0, toNonNegativeInt(corrected?.uniqueViewerTotal, 0));

        let legacyPreCutoverNotificationCount = 0;
        for (const row of ctx.db.notificationItem.iter()) {
            if (row.userId !== callerUserId) continue;
            if (timestampToMs(row.createdAt) >= cutoverAtMs && cutoverAtMs > 0) continue;

            const item = parseJsonRecord(row.item);
            if (readString(item.type) !== 'profile_view') continue;
            legacyPreCutoverNotificationCount += Math.max(0, toNonNegativeInt(item.viewCount, 1));
        }

        const updatedAt =
            cutover?.updatedAt ??
            corrected?.updatedAt ??
            ctx.db.accountStateItem.userId.find(callerUserId)?.updatedAt ??
            null;
        if (!updatedAt) {
            return [];
        }

        return [
            {
                userId: callerUserId,
                activeMetricVersion,
                dedupeWindowMs,
                cutoverAtMs: String(cutoverAtMs),
                correctedTotalCount,
                correctedUniqueViewerCount,
                legacyPreCutoverNotificationCount,
                legacyLabel: PROFILE_VIEW_METRIC_LABEL_LEGACY,
                correctedLabel: PROFILE_VIEW_METRIC_LABEL_V2,
                updatedAt,
            },
        ];
    },
);

export default spacetimedb;
