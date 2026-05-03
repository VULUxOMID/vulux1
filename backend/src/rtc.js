import { createHmac } from "node:crypto";

import { Server } from "socket.io";

import { verifyViewerUserId } from "./auth.js";

const DEFAULT_MAX_ACTIVE_PUBLISHERS = 2;
const DEFAULT_INVITE_TTL_MS = 60_000;
const DEFAULT_TURN_TTL_SECONDS = 3_600;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }
  return [];
}

function readPositiveInteger(value, fallback) {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : Number.parseInt(normalizeString(value), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function readBoolean(value, fallback = false) {
  const normalized = normalizeString(String(value)).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function sanitizeRoomId(value) {
  return normalizeString(value).slice(0, 160);
}

function sanitizeUserId(value) {
  return normalizeString(value).slice(0, 160);
}

function sanitizeName(value, fallback) {
  const normalized = normalizeString(value);
  return normalized ? normalized.slice(0, 80) : fallback;
}

function sanitizeUsername(value, fallback) {
  const normalized = normalizeString(value);
  return normalized ? normalized.slice(0, 80) : fallback;
}

function roomChannel(liveId) {
  return `rtc:${liveId}`;
}

function makeAck(ok, code, roomState, roomVersion) {
  return {
    ok,
    code,
    roomVersion: Number.isFinite(roomVersion) ? roomVersion : roomState?.roomVersion ?? 0,
    ...(roomState ? { roomState } : {}),
  };
}

function buildTurnServers(config) {
  const stunUrls = normalizeStringArray(config.stunUrls);
  const turnUrls = normalizeStringArray(config.turnUrls);
  const turnSecret = normalizeString(config.turnSecret);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = readPositiveInteger(config.turnTtlSeconds, DEFAULT_TURN_TTL_SECONDS);
  const expiry = nowSeconds + ttlSeconds;

  const servers = [];
  if (stunUrls.length > 0) {
    servers.push({
      urls: stunUrls,
    });
  }

  if (turnUrls.length > 0) {
    if (!turnSecret) {
      return servers;
    }

    const username = `${expiry}:vulu`;
    const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
    servers.push({
      urls: turnUrls,
      username,
      credential,
    });
  }

  return servers;
}

function createRoom(liveId) {
  return {
    liveId,
    hostUserId: "",
    roomVersion: 0,
    participantsByUserId: new Map(),
    activeSocketByUserId: new Map(),
    userIdBySocketId: new Map(),
    watcherUserIds: new Set(),
    panelUserIds: new Set(),
    pendingPanelInvites: new Map(),
    pendingPanelRequests: new Map(),
    activeScreenshareUserId: null,
  };
}

function snapshotParticipant(participant) {
  return {
    userId: participant.userId,
    authSubject: participant.authSubject,
    displayName: participant.displayName,
    username: participant.username,
    avatarUrl: participant.avatarUrl,
    role: participant.role,
    micEnabled: participant.micEnabled,
    cameraEnabled: participant.cameraEnabled,
    hasAudioTrack: participant.hasAudioTrack,
    hasVideoTrack: participant.hasVideoTrack,
    isConnectedToRtc: true,
    connectionState: "connected",
    joinedAt: participant.joinedAt,
  };
}

function snapshotRoom(room, currentUserId, config) {
  return {
    liveId: room.liveId,
    hostUserId: room.hostUserId || null,
    roomVersion: room.roomVersion,
    activeScreenshareUserId: room.activeScreenshareUserId,
    maxActivePublishers: config.maxActivePublishers,
    participants: Array.from(room.participantsByUserId.values()).map(snapshotParticipant),
    pendingPanelInvites: Array.from(room.pendingPanelInvites.values())
      .filter((invite) => invite.targetUserId === currentUserId)
      .map((invite) => ({
        targetUserId: invite.targetUserId,
        sourceUserId: invite.sourceUserId,
        createdAt: invite.createdAt,
      })),
    pendingPanelRequests: Array.from(room.pendingPanelRequests.values()).map((request) => ({
      requesterUserId: request.requesterUserId,
      createdAt: request.createdAt,
    })),
    iceServers: buildTurnServers(config),
    topology: config.topology,
  };
}

function cleanupExpiredIntents(room, ttlMs) {
  const now = Date.now();
  let changed = false;

  for (const [userId, invite] of room.pendingPanelInvites.entries()) {
    if (now - invite.createdAt <= ttlMs) continue;
    room.pendingPanelInvites.delete(userId);
    changed = true;
  }

  for (const [userId, request] of room.pendingPanelRequests.entries()) {
    if (now - request.createdAt <= ttlMs) continue;
    room.pendingPanelRequests.delete(userId);
    changed = true;
  }

  if (changed) {
    room.roomVersion += 1;
  }
}

function ensureRoom(roomsByLiveId, liveId) {
  const normalizedLiveId = sanitizeRoomId(liveId);
  if (!normalizedLiveId) return null;
  const existing = roomsByLiveId.get(normalizedLiveId);
  if (existing) return existing;
  const room = createRoom(normalizedLiveId);
  roomsByLiveId.set(normalizedLiveId, room);
  return room;
}

function removeRoomIfEmpty(roomsByLiveId, room) {
  if (room.participantsByUserId.size > 0) {
    return;
  }
  roomsByLiveId.delete(room.liveId);
}

function setParticipantRole(room, participant, role) {
  participant.role = role;
  if (role === "panel") {
    room.panelUserIds.add(participant.userId);
    room.watcherUserIds.delete(participant.userId);
    return;
  }
  room.panelUserIds.delete(participant.userId);
  room.watcherUserIds.add(participant.userId);
  participant.micEnabled = false;
  participant.cameraEnabled = false;
  participant.hasAudioTrack = false;
  participant.hasVideoTrack = false;
}

function countGuestPublishers(room) {
  let guestCount = 0;
  for (const userId of room.panelUserIds) {
    if (userId !== room.hostUserId) {
      guestCount += 1;
    }
  }
  return guestCount;
}

function canPromoteToPanel(room, userId, maxActivePublishers) {
  if (userId === room.hostUserId) return true;
  const guestCount = countGuestPublishers(room);
  return guestCount < Math.max(0, maxActivePublishers - 1);
}

function emitRoomState(io, room, config) {
  for (const participant of room.participantsByUserId.values()) {
    io.to(participant.socketId).emit("rtc:room_state", snapshotRoom(room, participant.userId, config));
  }
}

function removeParticipant(io, roomsByLiveId, socket, config) {
  const liveId = sanitizeRoomId(socket.data.liveId);
  const userId = sanitizeUserId(socket.data.userId);
  if (!liveId || !userId) return;

  const room = roomsByLiveId.get(liveId);
  if (!room) return;

  const activeSocketId = room.activeSocketByUserId.get(userId);
  if (activeSocketId !== socket.id) {
    room.userIdBySocketId.delete(socket.id);
    return;
  }

  const participant = room.participantsByUserId.get(userId);
  room.activeSocketByUserId.delete(userId);
  room.userIdBySocketId.delete(socket.id);
  room.participantsByUserId.delete(userId);
  room.watcherUserIds.delete(userId);
  room.panelUserIds.delete(userId);
  room.pendingPanelInvites.delete(userId);
  room.pendingPanelRequests.delete(userId);

  if (room.activeScreenshareUserId === userId) {
    room.activeScreenshareUserId = null;
  }

  if (room.hostUserId === userId) {
    room.hostUserId = "";
  }

  room.roomVersion += 1;
  socket.leave(roomChannel(liveId));
  io.to(roomChannel(liveId)).emit("rtc:participant_left", {
    userId,
    roomVersion: room.roomVersion,
  });
  if (participant) {
    emitRoomState(io, room, config);
  }
  removeRoomIfEmpty(roomsByLiveId, room);
}

function participantPayloadFromJoin(body, authSubject) {
  const userId = sanitizeUserId(body?.userId);
  if (!userId) {
    throw Object.assign(new Error("join_room requires userId."), { code: "invalid_user" });
  }

  const displayName = sanitizeName(body?.displayName, userId);
  const username = sanitizeUsername(body?.username, displayName);
  const avatarUrl = normalizeString(body?.avatarUrl).slice(0, 2_048);

  return {
    userId,
    authSubject,
    displayName,
    username,
    avatarUrl,
    micEnabled: body?.micEnabled !== false,
    cameraEnabled: body?.cameraEnabled !== false,
    hasAudioTrack: body?.micEnabled !== false,
    hasVideoTrack: body?.cameraEnabled !== false,
  };
}

function resolveTokenFromSocket(socket) {
  const authToken = normalizeString(socket.handshake.auth?.token);
  if (authToken) return authToken;

  const bearerHeader = normalizeString(socket.handshake.headers?.authorization);
  if (bearerHeader.toLowerCase().startsWith("bearer ")) {
    return bearerHeader.slice("bearer ".length).trim();
  }

  return "";
}

export function createRtcServer(httpServer, options) {
  const enabled = readBoolean(options?.enabled, false);
  const config = {
    enabled,
    topology: normalizeString(options?.topology) || "mesh",
    maxActivePublishers: readPositiveInteger(
      options?.maxActivePublishers,
      DEFAULT_MAX_ACTIVE_PUBLISHERS,
    ),
    inviteTtlMs: readPositiveInteger(options?.inviteTtlMs, DEFAULT_INVITE_TTL_MS),
    stunUrls: normalizeStringArray(options?.stunUrls),
    turnUrls: normalizeStringArray(options?.turnUrls),
    turnSecret: normalizeString(options?.turnSecret),
    turnTtlSeconds: readPositiveInteger(options?.turnTtlSeconds, DEFAULT_TURN_TTL_SECONDS),
    enableWebScreenshare: readBoolean(options?.enableWebScreenshare, false),
    enableNativeScreenshare: readBoolean(options?.enableNativeScreenshare, false),
    debugOverlay: readBoolean(options?.debugOverlay, false),
    jwks: options?.jwks ?? null,
    jwtVerifyOptions: options?.jwtVerifyOptions ?? null,
    verifyAuthToken:
      typeof options?.verifyAuthToken === "function" ? options.verifyAuthToken : null,
  };

  if (!enabled) {
    return {
      enabled: false,
      io: null,
      health: {
        enabled: false,
        authReady: false,
      },
    };
  }

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      credentials: false,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false,
    },
  });

  const roomsByLiveId = new Map();

  io.use(async (socket, next) => {
    try {
      if (!config.jwks || !config.jwtVerifyOptions) {
        if (!config.verifyAuthToken) {
          next(new Error("RTC auth is not configured."));
          return;
        }
      }

      const token = resolveTokenFromSocket(socket);
      if (!token) {
        next(new Error("Missing bearer token."));
        return;
      }

      const authSubject = config.verifyAuthToken
        ? await config.verifyAuthToken(token, socket)
        : await verifyViewerUserId({
            token,
            jwks: config.jwks,
            jwtVerifyOptions: config.jwtVerifyOptions,
          });
      socket.data.authSubject = authSubject;
      next();
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "Token verification failed.";
      next(new Error(message));
    }
  });

  io.on("connection", (socket) => {
    const authSubject = sanitizeUserId(socket.data.authSubject);

    const withRoom = (handler) => (payload = {}, ack) => {
      const liveId = sanitizeRoomId(payload?.liveId ?? socket.data.liveId);
      const room = liveId ? roomsByLiveId.get(liveId) : null;
      if (!room) {
        if (typeof ack === "function") {
          ack(makeAck(false, "room_not_found", null, 0));
        }
        return;
      }

      cleanupExpiredIntents(room, config.inviteTtlMs);
      handler(room, payload, typeof ack === "function" ? ack : null);
    };

    socket.on("rtc:join_room", (payload = {}, ack) => {
      try {
        const liveId = sanitizeRoomId(payload?.liveId);
        if (!liveId) {
          ack?.(makeAck(false, "invalid_live", null, 0));
          return;
        }

        const room = ensureRoom(roomsByLiveId, liveId);
        cleanupExpiredIntents(room, config.inviteTtlMs);

        const participantSeed = participantPayloadFromJoin(payload, authSubject);
        const asHost = payload?.asHost === true;

        if (!room.hostUserId && asHost) {
          room.hostUserId = participantSeed.userId;
        } else if (asHost && room.hostUserId && room.hostUserId !== participantSeed.userId) {
          ack?.(makeAck(false, "host_mismatch", snapshotRoom(room, participantSeed.userId, config), room.roomVersion));
          return;
        }

        const previousSocketId = room.activeSocketByUserId.get(participantSeed.userId);
        if (previousSocketId && previousSocketId !== socket.id) {
          const previousSocket = io.sockets.sockets.get(previousSocketId);
          if (previousSocket) {
            previousSocket.leave(roomChannel(liveId));
            previousSocket.disconnect(true);
          }
        }

        let participant = room.participantsByUserId.get(participantSeed.userId);
        const isExistingParticipant = Boolean(participant);

        if (!participant) {
          participant = {
            ...participantSeed,
            socketId: socket.id,
            role: "watcher",
            joinedAt: Date.now(),
          };
          room.participantsByUserId.set(participant.userId, participant);
        } else {
          participant.authSubject = authSubject;
          participant.displayName = participantSeed.displayName;
          participant.username = participantSeed.username;
          participant.avatarUrl = participantSeed.avatarUrl;
          participant.socketId = socket.id;
        }

        room.activeSocketByUserId.set(participant.userId, socket.id);
        room.userIdBySocketId.set(socket.id, participant.userId);
        socket.data.liveId = liveId;
        socket.data.userId = participant.userId;
        socket.join(roomChannel(liveId));

        if (participant.userId === room.hostUserId || room.panelUserIds.has(participant.userId)) {
          setParticipantRole(room, participant, "panel");
        } else {
          setParticipantRole(room, participant, "watcher");
        }

        if (participant.role === "panel" && !canPromoteToPanel(room, participant.userId, config.maxActivePublishers)) {
          setParticipantRole(room, participant, "watcher");
        }

        room.roomVersion += 1;
        const roomState = snapshotRoom(room, participant.userId, config);
        ack?.(makeAck(true, isExistingParticipant ? "rejoined" : "joined", roomState, room.roomVersion));

        io.to(roomChannel(liveId)).emit("rtc:participant_joined", {
          participant: snapshotParticipant(participant),
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
      } catch (error) {
        ack?.(
          makeAck(
            false,
            error && typeof error === "object" && "code" in error ? String(error.code) : "join_failed",
            null,
            0,
          ),
        );
      }
    });

    socket.on(
      "rtc:leave_room",
      withRoom((room, _payload, ack) => {
        const currentUserId = sanitizeUserId(socket.data.userId);
        removeParticipant(io, roomsByLiveId, socket, config);
        ack?.(makeAck(true, "left", snapshotRoom(room, currentUserId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:request_panel",
      withRoom((room, _payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        const participant = room.participantsByUserId.get(userId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }
        if (participant.role !== "watcher") {
          ack?.(makeAck(false, "already_panel", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        room.pendingPanelRequests.set(userId, {
          requesterUserId: userId,
          createdAt: Date.now(),
        });
        room.roomVersion += 1;

        if (room.hostUserId) {
          const hostSocketId = room.activeSocketByUserId.get(room.hostUserId);
          if (hostSocketId) {
            io.to(hostSocketId).emit("rtc:panel_request_received", {
              requesterUserId: userId,
              roomVersion: room.roomVersion,
            });
          }
        }
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "request_recorded", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:invite_panel",
      withRoom((room, payload, ack) => {
        const actorUserId = sanitizeUserId(socket.data.userId);
        if (!room.hostUserId || actorUserId !== room.hostUserId) {
          ack?.(makeAck(false, "host_only", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const targetUserId = sanitizeUserId(payload?.targetUserId);
        const target = room.participantsByUserId.get(targetUserId);
        if (!target) {
          ack?.(makeAck(false, "target_not_found", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }
        if (target.role === "panel") {
          ack?.(makeAck(false, "already_panel", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }
        if (!canPromoteToPanel(room, targetUserId, config.maxActivePublishers)) {
          ack?.(makeAck(false, "panel_full", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        room.pendingPanelInvites.set(targetUserId, {
          targetUserId,
          sourceUserId: actorUserId,
          createdAt: Date.now(),
        });
        room.roomVersion += 1;

        const targetSocketId = room.activeSocketByUserId.get(targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit("rtc:panel_invited", {
            sourceUserId: actorUserId,
            targetUserId,
            roomVersion: room.roomVersion,
          });
        }
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "invite_sent", snapshotRoom(room, actorUserId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:respond_panel_invite",
      withRoom((room, payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        const invite = room.pendingPanelInvites.get(userId);
        if (!invite) {
          ack?.(makeAck(false, "invite_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        const accepted = payload?.accepted === true;
        room.pendingPanelInvites.delete(userId);
        const participant = room.participantsByUserId.get(userId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        if (accepted) {
          if (!canPromoteToPanel(room, userId, config.maxActivePublishers)) {
            room.roomVersion += 1;
            emitRoomState(io, room, config);
            ack?.(makeAck(false, "panel_full", snapshotRoom(room, userId, config), room.roomVersion));
            return;
          }
          setParticipantRole(room, participant, "panel");
        }

        room.roomVersion += 1;
        io.to(roomChannel(room.liveId)).emit("rtc:panel_invite_resolved", {
          sourceUserId: invite.sourceUserId,
          targetUserId: userId,
          accepted,
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
        ack?.(
          makeAck(
            true,
            accepted ? "invite_accepted" : "invite_declined",
            snapshotRoom(room, userId, config),
            room.roomVersion,
          ),
        );
      }),
    );

    socket.on(
      "rtc:respond_panel_request",
      withRoom((room, payload, ack) => {
        const actorUserId = sanitizeUserId(socket.data.userId);
        if (!room.hostUserId || actorUserId !== room.hostUserId) {
          ack?.(makeAck(false, "host_only", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const targetUserId = sanitizeUserId(payload?.targetUserId);
        const request = room.pendingPanelRequests.get(targetUserId);
        if (!request) {
          ack?.(makeAck(false, "request_not_found", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const participant = room.participantsByUserId.get(targetUserId);
        room.pendingPanelRequests.delete(targetUserId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const accepted = payload?.accepted === true;
        if (accepted) {
          if (!canPromoteToPanel(room, targetUserId, config.maxActivePublishers)) {
            room.roomVersion += 1;
            emitRoomState(io, room, config);
            ack?.(makeAck(false, "panel_full", snapshotRoom(room, actorUserId, config), room.roomVersion));
            return;
          }
          setParticipantRole(room, participant, "panel");
        }

        room.roomVersion += 1;
        io.to(roomChannel(room.liveId)).emit("rtc:panel_request_resolved", {
          requesterUserId: targetUserId,
          accepted,
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
        ack?.(
          makeAck(
            true,
            accepted ? "request_accepted" : "request_declined",
            snapshotRoom(room, actorUserId, config),
            room.roomVersion,
          ),
        );
      }),
    );

    socket.on(
      "rtc:remove_panel_member",
      withRoom((room, payload, ack) => {
        const actorUserId = sanitizeUserId(socket.data.userId);
        if (!room.hostUserId || actorUserId !== room.hostUserId) {
          ack?.(makeAck(false, "host_only", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const targetUserId = sanitizeUserId(payload?.targetUserId);
        if (!targetUserId || targetUserId === room.hostUserId) {
          ack?.(makeAck(false, "invalid_target", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        const participant = room.participantsByUserId.get(targetUserId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, actorUserId, config), room.roomVersion));
          return;
        }

        setParticipantRole(room, participant, "watcher");
        room.pendingPanelInvites.delete(targetUserId);
        room.pendingPanelRequests.delete(targetUserId);
        if (room.activeScreenshareUserId === targetUserId) {
          room.activeScreenshareUserId = null;
        }
        room.roomVersion += 1;
        io.to(roomChannel(room.liveId)).emit("rtc:panel_request_resolved", {
          requesterUserId: targetUserId,
          accepted: false,
          removed: true,
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "panel_removed", snapshotRoom(room, actorUserId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:leave_panel",
      withRoom((room, _payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        if (userId === room.hostUserId) {
          ack?.(makeAck(false, "host_cannot_leave_panel", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        const participant = room.participantsByUserId.get(userId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        setParticipantRole(room, participant, "watcher");
        if (room.activeScreenshareUserId === userId) {
          room.activeScreenshareUserId = null;
        }
        room.roomVersion += 1;
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "left_panel", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:toggle_mic",
      withRoom((room, payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        const participant = room.participantsByUserId.get(userId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }
        if (participant.role === "watcher" && payload?.enabled !== false) {
          ack?.(makeAck(false, "watcher_cannot_publish", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        participant.micEnabled = payload?.enabled !== false;
        participant.hasAudioTrack = participant.role === "panel" && participant.micEnabled;
        room.roomVersion += 1;
        io.to(roomChannel(room.liveId)).emit("rtc:participant_media_state", {
          userId,
          micEnabled: participant.micEnabled,
          cameraEnabled: participant.cameraEnabled,
          hasAudioTrack: participant.hasAudioTrack,
          hasVideoTrack: participant.hasVideoTrack,
          role: participant.role,
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "mic_updated", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:toggle_camera",
      withRoom((room, payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        const participant = room.participantsByUserId.get(userId);
        if (!participant) {
          ack?.(makeAck(false, "participant_not_found", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }
        if (participant.role === "watcher" && payload?.enabled !== false) {
          ack?.(makeAck(false, "watcher_cannot_publish", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }

        participant.cameraEnabled = payload?.enabled !== false;
        participant.hasVideoTrack = participant.role === "panel" && participant.cameraEnabled;
        room.roomVersion += 1;
        io.to(roomChannel(room.liveId)).emit("rtc:participant_media_state", {
          userId,
          micEnabled: participant.micEnabled,
          cameraEnabled: participant.cameraEnabled,
          hasAudioTrack: participant.hasAudioTrack,
          hasVideoTrack: participant.hasVideoTrack,
          role: participant.role,
          roomVersion: room.roomVersion,
        });
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "camera_updated", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:start_web_screenshare",
      withRoom((room, _payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        if (!config.enableWebScreenshare) {
          ack?.(makeAck(false, "screenshare_disabled", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }
        const participant = room.participantsByUserId.get(userId);
        if (!participant || participant.role !== "panel") {
          ack?.(makeAck(false, "panel_only", snapshotRoom(room, userId, config), room.roomVersion));
          return;
        }
        room.activeScreenshareUserId = userId;
        room.roomVersion += 1;
        emitRoomState(io, room, config);
        ack?.(makeAck(true, "screenshare_started", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on(
      "rtc:stop_web_screenshare",
      withRoom((room, _payload, ack) => {
        const userId = sanitizeUserId(socket.data.userId);
        if (room.activeScreenshareUserId === userId) {
          room.activeScreenshareUserId = null;
          room.roomVersion += 1;
          emitRoomState(io, room, config);
        }
        ack?.(makeAck(true, "screenshare_stopped", snapshotRoom(room, userId, config), room.roomVersion));
      }),
    );

    socket.on("rtc:signal", (payload = {}) => {
      const sourceUserId = sanitizeUserId(socket.data.userId);
      const liveId = sanitizeRoomId(socket.data.liveId);
      const room = liveId ? roomsByLiveId.get(liveId) : null;
      if (!room) return;

      const targetUserId = sanitizeUserId(payload?.targetUserId);
      const targetSocketId = room.activeSocketByUserId.get(targetUserId);
      if (!targetSocketId) {
        socket.emit("rtc:error", {
          code: "target_not_found",
          targetUserId,
          roomVersion: room.roomVersion,
        });
        return;
      }

      io.to(targetSocketId).emit("rtc:signal", {
        kind: normalizeString(payload?.kind),
        targetUserId,
        sourceUserId,
        sdp: payload?.sdp ?? null,
        candidate: payload?.candidate ?? null,
        roomVersion: room.roomVersion,
      });
    });

    socket.on("disconnect", () => {
      removeParticipant(io, roomsByLiveId, socket, config);
    });
  });

  return {
    enabled: true,
    io,
    health: {
      enabled: true,
      authReady: Boolean(
        (config.jwks && config.jwtVerifyOptions) || config.verifyAuthToken,
      ),
    },
  };
}
