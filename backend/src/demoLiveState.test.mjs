import test from "node:test";
import assert from "node:assert/strict";

import { createDemoLiveStore } from "./demoLiveState.js";

test("create/start/join flow exposes live room to another user", () => {
  const store = createDemoLiveStore();

  const created = store.createRoom({
    hostUsername: "host_one",
    title: "Friday demo",
  });

  const started = store.startRoom({
    roomId: created.room.id,
    username: "host_one",
  });

  assert.equal(started.room.status, "live");

  const home = store.getState({ username: "viewer_two" });
  assert.equal(home.activeRooms.length, 1);
  assert.equal(home.activeRooms[0].title, "Friday demo");
  assert.equal(home.activeRooms[0].canJoin, true);

  const joined = store.joinRoom({
    roomId: created.room.id,
    username: "viewer_two",
  });

  assert.equal(joined.room.viewerUsernames.includes("viewer_two"), true);
});

test("invited viewer can accept a pre-live room and join", () => {
  const store = createDemoLiveStore();

  const created = store.createRoom({
    hostUsername: "host_one",
    title: "Backstage demo",
  });

  const inviteResult = store.inviteUser({
    roomId: created.room.id,
    username: "host_one",
    targetUsername: "viewer_two",
  });

  const state = store.getState({ username: "viewer_two" });
  assert.equal(state.pendingInvites.length, 1);
  assert.equal(state.pendingInvites[0].roomId, created.room.id);

  const accepted = store.respondToInvite({
    inviteId: inviteResult.invite.id,
    username: "viewer_two",
    accept: true,
  });

  assert.equal(accepted.room.viewerUsernames.includes("viewer_two"), true);
  assert.equal(accepted.invite.status, "accepted");
});

test("host cannot create multiple open rooms", () => {
  const store = createDemoLiveStore();

  const created = store.createRoom({
    hostUsername: "host_one",
    title: "One room",
  });

  assert.throws(
    () =>
      store.createRoom({
        hostUsername: "host_one",
        title: "Second room",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.roomId, created.room.id);
      return true;
    },
  );
});
