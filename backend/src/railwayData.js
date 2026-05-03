import { randomUUID } from "node:crypto";

import { isDatabaseConfigured, query, withTransaction } from "./db.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return toObject(parsed);
  } catch {
    return {};
  }
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID()}`;
}

export function isRailwayDataConfigured() {
  return isDatabaseConfigured();
}

export async function ensureUser(userId, patch = {}) {
  if (!isRailwayDataConfigured()) return null;
  const profile = toObject(patch.profile ?? patch);
  const email = normalizeString(patch.email ?? patch.emailAddress, null);
  const username = normalizeString(patch.username, null);
  const displayName = normalizeString(patch.displayName ?? patch.name ?? patch.fullName, null);
  const avatarUrl = normalizeString(patch.avatarUrl ?? patch.imageUrl, null);

  const { rows } = await query(
    `INSERT INTO app_users (auth_user_id, email, username, display_name, avatar_url, profile, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (auth_user_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, app_users.email),
       username = COALESCE(EXCLUDED.username, app_users.username),
       display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, app_users.avatar_url),
       profile = app_users.profile || EXCLUDED.profile,
       updated_at = NOW()
     RETURNING *`,
    [userId, email, username, displayName, avatarUrl, JSON.stringify(profile)],
  );
  return rows[0] ?? null;
}

function userRowToSocialUser(row) {
  const profile = toObject(row.profile);
  return {
    id: row.auth_user_id,
    userId: row.auth_user_id,
    authUserId: row.auth_user_id,
    emailAddress: row.email ?? profile.emailAddress ?? null,
    username: row.username ?? profile.username ?? null,
    name: row.display_name ?? profile.name ?? profile.displayName ?? row.username ?? "Vulu user",
    displayName: row.display_name ?? profile.displayName ?? profile.name ?? row.username ?? "Vulu user",
    avatarUrl: row.avatar_url ?? profile.avatarUrl ?? profile.imageUrl ?? null,
    roles: toArray(row.roles),
    ...profile,
  };
}

function notificationRowToItem(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    read: Boolean(row.read_at),
    deleted: Boolean(row.deleted_at),
    createdAt: new Date(row.created_at).getTime(),
    ...toObject(row.payload),
  };
}

function mediaRowToItem(row) {
  return {
    id: row.object_key,
    objectKey: row.object_key,
    userId: row.owner_user_id,
    creatorId: row.owner_user_id,
    publicUrl: row.public_url,
    url: row.public_url,
    contentType: row.content_type,
    mediaType: row.media_type,
    size: Number(row.size_bytes) || 0,
    createdAt: new Date(row.created_at).getTime(),
    ...toObject(row.metadata),
  };
}

function conversationRowToItem(row) {
  return {
    id: row.id,
    conversationKey: row.id,
    participantIds: row.participant_ids,
    updatedAt: new Date(row.updated_at).getTime(),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).getTime() : null,
    ...toObject(row.payload),
  };
}

function messageRowToItem(row) {
  const rawBody = toObject(row.body);
  const body = Object.keys(parseJsonObject(rawBody.item)).length > 0 ? parseJsonObject(rawBody.item) : rawBody;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    conversationKey: row.conversation_id,
    senderId: row.sender_user_id,
    targetUserId: row.target_user_id,
    roomId: row.room_id,
    createdAt: new Date(row.created_at).getTime(),
    deleted: rawBody.deleted === true,
    ...body,
  };
}

function liveRowToItem(row) {
  return {
    id: row.id,
    liveId: row.id,
    hostUserId: row.host_user_id,
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
    updatedAt: new Date(row.updated_at).getTime(),
    ...toObject(row.payload),
  };
}

async function readWalletAccount(userId) {
  await query("INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [
    userId,
  ]);
  const { rows } = await query("SELECT * FROM wallet_accounts WHERE user_id = $1", [userId]);
  const row = rows[0];
  return row
    ? {
        userId,
        gems: row.gems,
        cash: row.cash,
        fuel: row.fuel,
        ...toObject(row.payload),
      }
    : null;
}

export async function loadSnapshot(viewerUserId) {
  if (!isRailwayDataConfigured()) {
    return emptySnapshot();
  }
  await ensureUser(viewerUserId);

  const [
    users,
    friends,
    notifications,
    media,
    conversations,
    messages,
    globalMessages,
    lives,
    presence,
    wallet,
  ] = await Promise.all([
    query("SELECT * FROM app_users ORDER BY updated_at DESC LIMIT 500"),
    query(
      "SELECT * FROM friendships WHERE (requester_user_id = $1 OR addressee_user_id = $1) AND status = 'accepted'",
      [viewerUserId],
    ),
    query("SELECT * FROM notifications WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 250", [
      viewerUserId,
    ]),
    query("SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 500"),
    query("SELECT * FROM conversations WHERE $1 = ANY(participant_ids) ORDER BY updated_at DESC LIMIT 250", [
      viewerUserId,
    ]),
    query(
      `SELECT m.* FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE $1 = ANY(c.participant_ids)
       ORDER BY m.created_at DESC LIMIT 1000`,
      [viewerUserId],
    ),
    query(
      `SELECT * FROM messages
       WHERE room_id IS NOT NULL AND target_user_id IS NULL
       ORDER BY created_at DESC LIMIT 500`,
    ),
    query("SELECT * FROM live_rooms WHERE status != 'ended' ORDER BY updated_at DESC LIMIT 100"),
    query("SELECT * FROM live_presence ORDER BY updated_at DESC LIMIT 500"),
    readWalletAccount(viewerUserId),
  ]);

  const socialUsers = users.rows.map(userRowToSocialUser);
  const mediaItems = media.rows.map(mediaRowToItem);
  const messageItems = messages.rows.map(messageRowToItem);
  const globalMessageItems = globalMessages.rows.map(messageRowToItem).filter((item) => item.deleted !== true);
  const threadSeedMessagesByUserId = {};
  for (const message of messageItems) {
    const otherUserId =
      message.senderId === viewerUserId ? message.targetUserId : message.senderId;
    if (!otherUserId) continue;
    threadSeedMessagesByUserId[otherUserId] = [
      ...(threadSeedMessagesByUserId[otherUserId] ?? []),
      message,
    ];
  }

  return {
    lives: lives.rows.map(liveRowToItem),
    boostLeaderboard: [],
    knownLiveUsers: socialUsers,
    livePresence: presence.rows.map((row) => ({
      liveId: row.room_id,
      roomId: row.room_id,
      userId: row.user_id,
      role: row.role,
      updatedAt: new Date(row.updated_at).getTime(),
      ...toObject(row.payload),
    })),
    socialUsers,
    acceptedFriendIds: friends.rows.map((row) =>
      row.requester_user_id === viewerUserId ? row.addressee_user_id : row.requester_user_id,
    ),
    notifications: notifications.rows.map(notificationRowToItem),
    leaderboardItems: [],
    videos: mediaItems.filter((item) => item.mediaType === "video"),
    tracks: mediaItems.filter((item) => item.mediaType === "music" || item.mediaType === "audio"),
    playlists: [],
    artists: [],
    conversations: conversations.rows.map(conversationRowToItem),
    globalMessages: globalMessageItems,
    mentionUsers: socialUsers,
    threadSeedMessagesByUserId,
    wallet,
    searchIndex: {
      users: socialUsers,
      conversations: conversations.rows.map(conversationRowToItem),
      lives: lives.rows.map(liveRowToItem),
      videos: mediaItems.filter((item) => item.mediaType === "video"),
      tracks: mediaItems.filter((item) => item.mediaType === "music" || item.mediaType === "audio"),
    },
  };
}

export async function readAccountState(viewerUserId) {
  if (!isRailwayDataConfigured()) {
    return null;
  }
  await ensureUser(viewerUserId);
  const [{ rows: userRows }, wallet] = await Promise.all([
    query("SELECT * FROM app_users WHERE auth_user_id = $1", [viewerUserId]),
    readWalletAccount(viewerUserId),
  ]);
  const user = userRows[0] ?? {};
  const profile = toObject(user.profile);
  return {
    account: {
      authUserId: viewerUserId,
      email: user.email ?? profile.email ?? profile.emailAddress ?? null,
      username: user.username ?? profile.username ?? null,
      displayName: user.display_name ?? profile.displayName ?? profile.name ?? null,
      avatarUrl: user.avatar_url ?? profile.avatarUrl ?? profile.imageUrl ?? null,
    },
    profile,
    onboarding: toObject(user.onboarding),
    wallet,
  };
}

export async function writeAccountState(viewerUserId, updates) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false };
  }
  const patch = toObject(updates.updates ?? updates);
  const account = toObject(patch.account);
  const profile = toObject(patch.profile ?? patch.userProfile);
  const onboarding = toObject(patch.onboarding);
  const wallet = toObject(patch.wallet);

  await ensureUser(viewerUserId, {
    email: account.email,
    username: account.username,
    displayName: account.displayName ?? account.name,
    avatarUrl: account.avatarUrl,
    profile: {
      ...profile,
      ...(Object.keys(account).length > 0 ? { account } : {}),
    },
  });

  if (Object.keys(onboarding).length > 0) {
    await query(
      `UPDATE app_users
       SET onboarding = onboarding || $2::jsonb, updated_at = NOW()
       WHERE auth_user_id = $1`,
      [viewerUserId, JSON.stringify(onboarding)],
    );
  }

  if (Object.keys(wallet).length > 0) {
    await query(
      `INSERT INTO wallet_accounts (user_id, gems, cash, fuel, payload)
       VALUES ($1, COALESCE($2, 0), COALESCE($3, 0), COALESCE($4, 0), $5::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         gems = COALESCE($2, wallet_accounts.gems),
         cash = COALESCE($3, wallet_accounts.cash),
         fuel = COALESCE($4, wallet_accounts.fuel),
         payload = wallet_accounts.payload || EXCLUDED.payload,
         updated_at = NOW()`,
      [
        viewerUserId,
        Number.isFinite(Number(wallet.gems)) ? Math.max(0, Math.floor(Number(wallet.gems))) : null,
        Number.isFinite(Number(wallet.cash)) ? Math.max(0, Math.floor(Number(wallet.cash))) : null,
        Number.isFinite(Number(wallet.fuel)) ? Math.max(0, Math.floor(Number(wallet.fuel))) : null,
        JSON.stringify(wallet),
      ],
    );
  }

  return { ok: true, durable: true, state: await readAccountState(viewerUserId) };
}

export function emptySnapshot() {
  return {
    lives: [],
    boostLeaderboard: [],
    knownLiveUsers: [],
    livePresence: [],
    socialUsers: [],
    acceptedFriendIds: [],
    notifications: [],
    leaderboardItems: [],
    videos: [],
    tracks: [],
    playlists: [],
    artists: [],
    conversations: [],
    globalMessages: [],
    mentionUsers: [],
    threadSeedMessagesByUserId: {},
    wallet: null,
    searchIndex: {
      users: [],
      conversations: [],
      videos: [],
      tracks: [],
    },
  };
}

async function insertNotification(userId, type, payload) {
  const id = normalizeString(payload.id, makeId("notification"));
  await query(
    `INSERT INTO notifications (id, user_id, type, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
    [id, userId, type, JSON.stringify(payload)],
  );
}

async function upsertConversationMessage(viewerUserId, body) {
  const targetUserId = normalizeString(body.toUserId ?? body.targetUserId ?? body.recipientId, null);
  const conversationId = normalizeString(
    body.conversationKey ?? body.conversationId,
    targetUserId
      ? [viewerUserId, targetUserId].sort().join(":")
      : `room:${normalizeString(body.roomId, "global")}`,
  );
  const messageId = normalizeString(body.messageId ?? body.id, makeId("message"));
  const roomId = normalizeString(body.roomId, null);
  const participantIds = targetUserId ? [viewerUserId, targetUserId].sort() : [viewerUserId];
  const parsedItem = parseJsonObject(body.item);
  const message =
    Object.keys(parsedItem).length > 0
      ? { ...parsedItem, item: body.item }
      : toObject(body.message ?? body);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO conversations (id, participant_ids, payload, last_message_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         participant_ids = EXCLUDED.participant_ids,
         payload = conversations.payload || EXCLUDED.payload,
         last_message_at = NOW(),
         updated_at = NOW()`,
      [conversationId, participantIds, JSON.stringify({ participantIds })],
    );
    await client.query(
      `INSERT INTO messages (id, conversation_id, sender_user_id, target_user_id, room_id, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
      [messageId, conversationId, viewerUserId, targetUserId, roomId, JSON.stringify(message)],
    );
  });
}

async function upsertMediaAsset(viewerUserId, body) {
  const objectKey = normalizeString(body.objectKey, null);
  const publicUrl = normalizeString(body.publicUrl ?? body.url, null);
  if (!objectKey || !publicUrl) {
    throw Object.assign(new Error("objectKey and publicUrl are required."), { statusCode: 400 });
  }
  await query(
    `INSERT INTO media_assets (object_key, owner_user_id, public_url, content_type, media_type, size_bytes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (object_key) DO UPDATE SET
       public_url = EXCLUDED.public_url,
       content_type = EXCLUDED.content_type,
       media_type = EXCLUDED.media_type,
       size_bytes = EXCLUDED.size_bytes,
       metadata = media_assets.metadata || EXCLUDED.metadata`,
    [
      objectKey,
      viewerUserId,
      publicUrl,
      normalizeString(body.contentType, "application/octet-stream"),
      normalizeString(body.mediaType, "media"),
      Number.isFinite(Number(body.size)) ? Math.max(0, Math.floor(Number(body.size))) : 0,
      JSON.stringify(toObject(body)),
    ],
  );
}

export async function handleMutation(pathname, method, viewerUserId, body) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false };
  }
  await ensureUser(viewerUserId);

  if (pathname === "/api/social/update-status") {
    await ensureUser(viewerUserId, { profile: { status: body.status ?? body } });
    return { ok: true, durable: true };
  }
  if (pathname === "/api/social/set-live") {
    await ensureUser(viewerUserId, { profile: { live: body } });
    return { ok: true, durable: true };
  }
  if (pathname.startsWith("/api/social/")) {
    await insertNotification(
      normalizeString(body.targetUserId ?? body.userId, viewerUserId),
      pathname.replace("/api/social/", ""),
      { ...toObject(body), actorUserId: viewerUserId },
    );
    return { ok: true, durable: true };
  }
  if (pathname.startsWith("/api/messages/")) {
    if (pathname.endsWith("/global/edit")) {
      const messageId = normalizeString(body.messageId ?? body.id, null);
      if (messageId) {
        await query(
          "UPDATE messages SET body = body || $2::jsonb, updated_at = NOW() WHERE id = $1",
          [messageId, JSON.stringify({ text: body.text })],
        );
      }
      return { ok: true, durable: true };
    }
    if (pathname.endsWith("/global/delete")) {
      const messageId = normalizeString(body.messageId ?? body.id, null);
      if (messageId) {
        await query(
          "UPDATE messages SET body = body || $2::jsonb, updated_at = NOW() WHERE id = $1",
          [messageId, JSON.stringify({ deleted: true })],
        );
      }
      return { ok: true, durable: true };
    }
    if (pathname.endsWith("/read")) {
      const conversationId = normalizeString(body.conversationKey ?? body.conversationId, null);
      if (conversationId) {
        await query(
          "UPDATE messages SET read_by = array_append(read_by, $1), updated_at = NOW() WHERE conversation_id = $2 AND NOT ($1 = ANY(read_by))",
          [viewerUserId, conversationId],
        );
      }
      return { ok: true, durable: true };
    }
    await upsertConversationMessage(viewerUserId, body);
    return { ok: true, durable: true };
  }
  if (pathname.startsWith("/api/media/")) {
    await upsertMediaAsset(viewerUserId, body);
    return { ok: true, durable: true };
  }

  if (method === "DELETE" && pathname.startsWith("/api/notifications/")) {
    const id = pathname.split("/").pop();
    await query("UPDATE notifications SET deleted_at = NOW() WHERE id = $1 AND user_id = $2", [
      id,
      viewerUserId,
    ]);
    return { ok: true, durable: true };
  }

  return { ok: true, durable: false };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function handleLiveMutation(pathname, viewerUserId, body) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false };
  }
  await ensureUser(viewerUserId);

  const liveId = normalizeString(body.liveId, null);
  const operation = pathname.split("/").filter(Boolean).at(-1) ?? "mutate";
  if (!liveId && operation !== "set-presence") {
    throw Object.assign(new Error("liveId is required."), { statusCode: 400, code: "invalid_input" });
  }

  if (operation === "start" || operation === "start-live") {
    const hostUserId = normalizeString(body.ownerUserId ?? body.hostUserId, viewerUserId);
    const payload = {
      ...toObject(body),
      hosts: parseJsonArray(body.hosts),
      bannedUserIds: parseJsonArray(body.bannedUserIds),
    };
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO live_rooms (id, host_user_id, status, payload, started_at, updated_at)
         VALUES ($1, $2, 'live', $3::jsonb, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           host_user_id = EXCLUDED.host_user_id,
           status = 'live',
           payload = live_rooms.payload || EXCLUDED.payload,
           started_at = COALESCE(live_rooms.started_at, NOW()),
           ended_at = NULL,
           updated_at = NOW()`,
        [liveId, hostUserId, JSON.stringify(payload)],
      );
      await client.query(
        `INSERT INTO live_presence (room_id, user_id, role, payload, updated_at)
         VALUES ($1, $2, 'host', $3::jsonb, NOW())
         ON CONFLICT (room_id, user_id) DO UPDATE SET
           role = 'host',
           payload = live_presence.payload || EXCLUDED.payload,
           updated_at = NOW()`,
        [liveId, hostUserId, JSON.stringify({ activity: "hosting" })],
      );
    });
    return { ok: true, durable: true, liveId };
  }

  if (operation === "update" || operation === "update-live") {
    await query(
      `UPDATE live_rooms
       SET payload = payload || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [liveId, JSON.stringify(toObject(body))],
    );
    return { ok: true, durable: true, liveId };
  }

  if (operation === "end" || operation === "end-live") {
    await query(
      `UPDATE live_rooms
       SET status = 'ended', ended_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [liveId],
    );
    await query("DELETE FROM live_presence WHERE room_id = $1", [liveId]);
    return { ok: true, durable: true, liveId };
  }

  if (operation === "presence" || operation === "set-presence") {
    const userId = normalizeString(body.userId, viewerUserId);
    const activity = normalizeString(body.activity, "none");
    const roomId = liveId ?? normalizeString(body.roomId, null);
    if (!roomId || activity === "none") {
      await query("DELETE FROM live_presence WHERE user_id = $1", [userId]);
      return { ok: true, durable: true, liveId: roomId };
    }
    await query(
      `INSERT INTO live_presence (room_id, user_id, role, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (room_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         payload = live_presence.payload || EXCLUDED.payload,
         updated_at = NOW()`,
      [
        roomId,
        userId,
        activity === "hosting" ? "host" : "viewer",
        JSON.stringify(toObject(body)),
      ],
    );
    return { ok: true, durable: true, liveId: roomId };
  }

  if (operation === "ban" || operation === "unban" || operation === "boost" || operation === "tick") {
    await query(
      `UPDATE live_rooms
       SET payload = payload || $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [liveId, JSON.stringify({ [`last${operation[0].toUpperCase()}${operation.slice(1)}`]: body })],
    );
    return { ok: true, durable: true, liveId };
  }

  return { ok: true, durable: false, liveId };
}

export async function handleWalletMutation(viewerUserId, body) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false };
  }
  await ensureUser(viewerUserId);
  const mutation = normalizeString(body.mutation, "wallet_mutation");
  const amountGems = Math.max(0, Math.floor(Number(body.gemsToCredit ?? body.gemsToSpend ?? body.gemsToConvert ?? 0)));
  const amountCash = Math.max(0, Math.floor(Number(body.cashToSpend ?? body.cashToConvert ?? 0)));
  const amountFuel = Math.max(0, Math.floor(Number(body.fuelAmount ?? body.fuelToSpend ?? 0)));
  const id = makeId("wallet");

  const deltas = {
    deltaGems:
      mutation.includes("credit") || mutation.includes("claim") ? amountGems || 10 : -amountGems,
    deltaCash: mutation === "convert_gems_to_cash" ? amountGems * 10 : -amountCash,
    deltaFuel: mutation === "purchase_fuel_pack" ? amountFuel : mutation === "spend_fuel" ? -amountFuel : 0,
  };

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO wallet_accounts (user_id, gems, cash, fuel)
       VALUES ($1, GREATEST(0, $2), GREATEST(0, $3), GREATEST(0, $4))
       ON CONFLICT (user_id) DO UPDATE SET
         gems = GREATEST(0, wallet_accounts.gems + $2),
         cash = GREATEST(0, wallet_accounts.cash + $3),
         fuel = GREATEST(0, wallet_accounts.fuel + $4),
         updated_at = NOW()`,
      [viewerUserId, deltas.deltaGems, deltas.deltaCash, deltas.deltaFuel],
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, delta_gems, delta_cash, delta_fuel, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        viewerUserId,
        mutation,
        deltas.deltaGems,
        deltas.deltaCash,
        deltas.deltaFuel,
        JSON.stringify(toObject(body)),
      ],
    );
  });

  return { ok: true, durable: true };
}

export async function createWithdrawal(viewerUserId, body) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false, request: null };
  }
  await ensureUser(viewerUserId);
  const amountGems = Math.max(0, Math.floor(Number(body.amountGems ?? 0)));
  if (amountGems <= 0) {
    throw Object.assign(new Error("amountGems must be greater than zero."), {
      statusCode: 400,
      code: "invalid_input",
    });
  }

  const request = {
    id: normalizeString(body.id, makeId("withdrawal")),
    amountGems,
    amountRealMoney: Number((amountGems / 1000).toFixed(2)),
    status: "pending",
    method: normalizeString(body.method, "Unknown"),
    details: toObject(body.details),
  };

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO withdrawal_requests (id, user_id, amount_gems, amount_real_money, status, method, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        request.id,
        viewerUserId,
        request.amountGems,
        request.amountRealMoney,
        request.status,
        request.method,
        JSON.stringify(request.details),
      ],
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, delta_gems, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [makeId("wallet"), viewerUserId, "withdrawal_requested", -amountGems, JSON.stringify(request)],
    );
  });

  return { ok: true, durable: true, request };
}

export async function listWithdrawals(viewerUserId) {
  if (!isRailwayDataConfigured()) return [];
  const { rows } = await query(
    "SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
    [viewerUserId],
  );
  return rows.map((row) => ({
    id: row.id,
    amountGems: row.amount_gems,
    amountRealMoney: Number(row.amount_real_money),
    status: row.status,
    date: row.created_at,
    method: row.method,
    details: row.details,
  }));
}

function transferRowToRecord(row, viewerUserId) {
  const payload = toObject(row.payload);
  const senderUserId = normalizeString(payload.senderUserId, row.user_id);
  const targetUserId = normalizeString(payload.targetUserId, null);
  const isSent = senderUserId === viewerUserId;
  return {
    id: row.id,
    direction: isSent ? "sent" : "received",
    amountCash: Math.abs(Number(row.delta_cash) || Number(payload.amountCash) || 0),
    note: normalizeString(payload.note, ""),
    createdAt: row.created_at,
    otherUserId: isSent ? targetUserId : senderUserId,
    otherAuthUserId: isSent ? targetUserId : senderUserId,
    otherHandle: normalizeString(payload.targetHandle ?? payload.senderHandle, "Vulu user"),
  };
}

export async function listCashTransfers(viewerUserId, limit = 20) {
  if (!isRailwayDataConfigured()) return [];
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  const { rows } = await query(
    `SELECT * FROM wallet_transactions
     WHERE type = 'cash_transfer'
       AND (user_id = $1 OR payload->>'targetUserId' = $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [viewerUserId, boundedLimit],
  );
  return rows.map((row) => transferRowToRecord(row, viewerUserId));
}

export async function createCashTransfer(viewerUserId, body) {
  if (!isRailwayDataConfigured()) {
    return { ok: true, durable: false, transfer: null };
  }
  await ensureUser(viewerUserId);
  const targetUserId = normalizeString(body.targetUserId, null);
  const amountCash = Math.max(0, Math.floor(Number(body.amountCash ?? 0)));
  if (!targetUserId) {
    throw Object.assign(new Error("targetUserId is required."), {
      statusCode: 400,
      code: "invalid_input",
    });
  }
  if (amountCash <= 0) {
    throw Object.assign(new Error("amountCash must be greater than zero."), {
      statusCode: 400,
      code: "invalid_input",
    });
  }

  const id = normalizeString(body.requestIdempotencyKey, makeId("cash-transfer"));
  const payload = {
    ...toObject(body),
    senderUserId: viewerUserId,
    targetUserId,
    amountCash,
  };

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO wallet_accounts (user_id, cash)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO UPDATE SET
         cash = GREATEST(0, wallet_accounts.cash - $2),
         updated_at = NOW()`,
      [viewerUserId, amountCash],
    );
    await client.query(
      `INSERT INTO wallet_accounts (user_id, cash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         cash = wallet_accounts.cash + $2,
         updated_at = NOW()`,
      [targetUserId, amountCash],
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, delta_cash, payload)
       VALUES ($1, $2, 'cash_transfer', $3, $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id, viewerUserId, -amountCash, JSON.stringify(payload)],
    );
  });

  return {
    ok: true,
    durable: true,
    transfer: {
      id,
      direction: "sent",
      amountCash,
      note: normalizeString(body.note, ""),
      createdAt: new Date().toISOString(),
      otherUserId: targetUserId,
      otherAuthUserId: targetUserId,
      otherHandle: normalizeString(body.targetHandle, "Vulu user"),
    },
  };
}
