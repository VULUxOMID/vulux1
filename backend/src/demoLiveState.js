import { randomUUID } from "node:crypto";

function createValidationError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
}

function normalizeUsername(value, fieldName = "username") {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) {
    throw createValidationError(`${fieldName} is required.`);
  }

  if (!/^[a-z0-9._-]{2,24}$/.test(normalized)) {
    throw createValidationError(
      `${fieldName} must be 2-24 characters and use only letters, numbers, dot, underscore, or dash.`,
    );
  }

  return normalized;
}

function normalizeTitle(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw createValidationError("title is required.");
  }

  if (normalized.length > 80) {
    throw createValidationError("title must be 80 characters or fewer.");
  }

  return normalized;
}

function normalizeRoomId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw createValidationError("roomId is required.");
  }
  return normalized;
}

function normalizeInviteId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw createValidationError("inviteId is required.");
  }
  return normalized;
}

function compareDescendingByUpdatedAt(a, b) {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

function compareDescendingByStartedAt(a, b) {
  return (b.startedAt ?? 0) - (a.startedAt ?? 0) || compareDescendingByUpdatedAt(a, b);
}

export function createDemoLiveStore() {
  const rooms = new Map();
  const invites = new Map();

  function findOpenRoomByHost(hostUsername) {
    for (const room of rooms.values()) {
      if (room.hostUsername === hostUsername && room.status !== "ended") {
        return room;
      }
    }
    return null;
  }

  function findPendingInviteForRoom(roomId, targetUsername) {
    for (const invite of invites.values()) {
      if (
        invite.roomId === roomId &&
        invite.targetUsername === targetUsername &&
        invite.status === "pending"
      ) {
        return invite;
      }
    }
    return null;
  }

  function getRoomOrThrow(roomId) {
    const room = rooms.get(normalizeRoomId(roomId));
    if (!room) {
      throw createValidationError("Room not found.", 404);
    }
    return room;
  }

  function getInviteOrThrow(inviteId) {
    const invite = invites.get(normalizeInviteId(inviteId));
    if (!invite) {
      throw createValidationError("Invite not found.", 404);
    }
    return invite;
  }

  function ensureHost(room, username) {
    if (room.hostUsername !== username) {
      throw createValidationError("Only the host can do that.", 403);
    }
  }

  function isUserInvited(room, username) {
    if (room.invitedUsernames.has(username)) {
      return true;
    }

    const invite = findPendingInviteForRoom(room.id, username);
    return !!invite;
  }

  function canJoinRoom(room, username) {
    if (room.status === "ended") return false;
    if (room.hostUsername === username) return true;
    if (room.status === "live") return true;
    return isUserInvited(room, username);
  }

  function buildRoomSnapshot(room, username) {
    const normalizedUsername = username
      ? normalizeUsername(username)
      : null;
    const pendingInvite = normalizedUsername
      ? findPendingInviteForRoom(room.id, normalizedUsername)
      : null;

    return {
      id: room.id,
      title: room.title,
      hostUsername: room.hostUsername,
      status: room.status,
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      updatedAt: room.updatedAt,
      viewerCount: room.viewerUsernames.size,
      viewerUsernames: [...room.viewerUsernames].sort(),
      invitedUsernames: [...room.invitedUsernames].sort(),
      isHost: normalizedUsername === room.hostUsername,
      isViewer: normalizedUsername ? room.viewerUsernames.has(normalizedUsername) : false,
      canJoin: normalizedUsername ? canJoinRoom(room, normalizedUsername) : room.status === "live",
      invitePending: !!pendingInvite,
    };
  }

  function buildInviteSnapshot(invite) {
    const room = rooms.get(invite.roomId) ?? null;
    return {
      id: invite.id,
      roomId: invite.roomId,
      roomTitle: room?.title ?? "Untitled live",
      roomStatus: room?.status ?? "ended",
      hostUsername: invite.hostUsername,
      targetUsername: invite.targetUsername,
      status: invite.status,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
    };
  }

  function touchRoom(room) {
    room.updatedAt = Date.now();
  }

  return {
    login({ username }) {
      return {
        username: normalizeUsername(username),
      };
    },

    getState({ username }) {
      const normalizedUsername = normalizeUsername(username);

      const activeRooms = [];
      const myRooms = [];
      for (const room of rooms.values()) {
        if (room.status === "live") {
          activeRooms.push(buildRoomSnapshot(room, normalizedUsername));
        }

        if (
          room.status !== "ended" &&
          (
            room.hostUsername === normalizedUsername ||
            room.viewerUsernames.has(normalizedUsername)
          )
        ) {
          myRooms.push(buildRoomSnapshot(room, normalizedUsername));
        }
      }

      const pendingInvites = [];
      for (const invite of invites.values()) {
        if (
          invite.targetUsername === normalizedUsername &&
          invite.status === "pending"
        ) {
          pendingInvites.push(buildInviteSnapshot(invite));
        }
      }

      activeRooms.sort(compareDescendingByStartedAt);
      myRooms.sort(compareDescendingByUpdatedAt);
      pendingInvites.sort(compareDescendingByUpdatedAt);

      return {
        username: normalizedUsername,
        activeRooms,
        myRooms,
        pendingInvites,
      };
    },

    getRoom({ roomId, username }) {
      const normalizedUsername = normalizeUsername(username);
      const room = getRoomOrThrow(roomId);

      if (!canJoinRoom(room, normalizedUsername)) {
        throw createValidationError("You cannot access this room yet.", 403);
      }

      return {
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },

    createRoom({ hostUsername, title }) {
      const normalizedHostUsername = normalizeUsername(hostUsername, "hostUsername");
      const normalizedTitle = normalizeTitle(title);
      const existingRoom = findOpenRoomByHost(normalizedHostUsername);
      if (existingRoom) {
        throw createValidationError("You already have an open demo room.", 409, {
          roomId: existingRoom.id,
        });
      }

      const now = Date.now();
      const room = {
        id: `demo-live-${randomUUID()}`,
        title: normalizedTitle,
        hostUsername: normalizedHostUsername,
        status: "created",
        createdAt: now,
        startedAt: null,
        updatedAt: now,
        viewerUsernames: new Set(),
        invitedUsernames: new Set(),
      };

      rooms.set(room.id, room);

      return {
        room: buildRoomSnapshot(room, normalizedHostUsername),
      };
    },

    startRoom({ roomId, username }) {
      const normalizedUsername = normalizeUsername(username);
      const room = getRoomOrThrow(roomId);
      ensureHost(room, normalizedUsername);

      if (room.status === "ended") {
        throw createValidationError("This room has already ended.", 409);
      }

      if (room.status !== "live") {
        room.status = "live";
        room.startedAt = room.startedAt ?? Date.now();
        touchRoom(room);
      }

      return {
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },

    joinRoom({ roomId, username }) {
      const normalizedUsername = normalizeUsername(username);
      const room = getRoomOrThrow(roomId);

      if (!canJoinRoom(room, normalizedUsername)) {
        throw createValidationError("This room is not ready for you to join.", 403);
      }

      if (room.hostUsername !== normalizedUsername) {
        room.viewerUsernames.add(normalizedUsername);
      }
      touchRoom(room);

      return {
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },

    leaveRoom({ roomId, username }) {
      const normalizedUsername = normalizeUsername(username);
      const room = getRoomOrThrow(roomId);

      if (room.hostUsername === normalizedUsername) {
        room.status = "ended";
      } else {
        room.viewerUsernames.delete(normalizedUsername);
      }

      touchRoom(room);

      return {
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },

    inviteUser({ roomId, username, targetUsername }) {
      const normalizedUsername = normalizeUsername(username);
      const normalizedTargetUsername = normalizeUsername(targetUsername, "targetUsername");
      const room = getRoomOrThrow(roomId);
      ensureHost(room, normalizedUsername);

      if (room.status === "ended") {
        throw createValidationError("This room has ended.", 409);
      }

      if (normalizedTargetUsername === room.hostUsername) {
        throw createValidationError("You cannot invite yourself.", 400);
      }

      if (room.viewerUsernames.has(normalizedTargetUsername)) {
        throw createValidationError("That user is already in the room.", 409);
      }

      const existingInvite = findPendingInviteForRoom(room.id, normalizedTargetUsername);
      if (existingInvite) {
        return {
          invite: buildInviteSnapshot(existingInvite),
          room: buildRoomSnapshot(room, normalizedUsername),
        };
      }

      const invite = {
        id: `demo-invite-${randomUUID()}`,
        roomId: room.id,
        hostUsername: room.hostUsername,
        targetUsername: normalizedTargetUsername,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      room.invitedUsernames.add(normalizedTargetUsername);
      touchRoom(room);
      invites.set(invite.id, invite);

      return {
        invite: buildInviteSnapshot(invite),
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },

    respondToInvite({ inviteId, username, accept }) {
      const normalizedUsername = normalizeUsername(username);
      const invite = getInviteOrThrow(inviteId);

      if (invite.targetUsername !== normalizedUsername) {
        throw createValidationError("This invite does not belong to you.", 403);
      }

      if (invite.status !== "pending") {
        throw createValidationError("This invite has already been handled.", 409);
      }

      const room = getRoomOrThrow(invite.roomId);
      if (room.status === "ended") {
        invite.status = "declined";
        invite.updatedAt = Date.now();
        throw createValidationError("This room has already ended.", 409);
      }

      invite.status = accept ? "accepted" : "declined";
      invite.updatedAt = Date.now();

      if (accept) {
        room.viewerUsernames.add(normalizedUsername);
      }
      touchRoom(room);

      return {
        invite: buildInviteSnapshot(invite),
        room: buildRoomSnapshot(room, normalizedUsername),
      };
    },
  };
}
