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

const CURRENT_IDENTITY_PROVIDER = 'clerk';
const LEGACY_CALLER_USER_ID_CLAIM_PATHS = [
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
    auditLogItem: table(
        { public: false },
        {
            id: t.string().primaryKey(),
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

const myAccountStateRow = t.row('MyAccountStateRow', {
    userId: t.string(),
    state: t.string(),
    updatedAt: t.timestamp(),
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

export const myAccountState = spacetimedb.view(
    { name: 'my_account_state', public: true },
    t.array(myAccountStateRow),
    (ctx) => {
        const callerUserId = requireViewCallerUserId(ctx);
        return ctx.from.accountStateItem.where((row) => row.userId.eq(callerUserId)).build();
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

export default spacetimedb;
