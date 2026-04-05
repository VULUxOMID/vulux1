# VUL-65 Profile Views Safe V1

## Scope

Safe V1 frontend-only change set:

- stabilize profile-open tracking across duplicate `ProfileModal` mounts
- persist a client-side viewer/profile cooldown gate so reconnects and relaunches do not re-emit views inside the dedupe window
- keep backend reducers, metric tables, and wallet/live logic untouched

## Read-only audit

Existing backend metric behavior already lives in:

- `vulu-spacetime/spacetimedb/src/reducers.ts`
- `vulu-spacetime/spacetimedb/src/profileViewMetrics.ts`
- `vulu-spacetime/spacetimedb/src/profileViewMetrics.test.mjs`

Audit result:

- reducer contract already excludes self views
- reducer contract already dedupes repeated opens inside the cooldown window
- reducer contract already counts the cooldown boundary correctly
- reducer contract already persists dedupe state across reconnect/relaunch because it stores pair state server-side

This ticket only hardens the client so it stops sending redundant track events into that existing path.

## Frontend changes

- `src/context/ProfileContext.tsx`
  - stores a stable `selectedUserOpenedAtMs` for each logical profile open
- `src/components/ProfileModal.tsx`
  - uses the shared open timestamp instead of generating a fresh timestamp per mounted modal instance
- `src/lib/profileViewTracking.ts`
  - adds pure client-side decision helpers for self-view exclusion, dedupe, cooldown boundary, and stable event IDs
- `src/lib/spacetime.ts`
  - serializes tracking attempts per viewer/profile pair
  - persists last successful tracked timestamp in AsyncStorage under `vulu.profile-view-tracking.v1`

## Automated proof

```bash
npx tsx --test src/lib/profileViewTracking.test.ts
node --test vulu-spacetime/spacetimedb/src/profileViewMetrics.test.mjs
```

Results:

```text
✔ profile view tracking: self-view is excluded on the client
✔ profile view tracking: repeat open inside dedupe window is dropped on the client
✔ profile view tracking: cooldown boundary allows a new client event
✔ profile view tracking: stable event id is reused for the same modal open
```

```text
✔ profile view: self-view is excluded
✔ profile view: repeat open inside dedupe window is dropped
✔ profile view: repeat open after dedupe window is counted
✔ profile view: pre-cutover events are dropped
✔ profile view: dedupe window normalization clamps invalid values
```

## Manual QA

1. Open another user's profile from any list surface.
2. Browse photos inside that same modal session.
3. Close and reopen the same profile within 30 minutes.
4. Force a reconnect or relaunch the app and reopen the same profile within 30 minutes.
5. Open your own profile preview.

Expected:

- only one profile-view track event is emitted for the first open in the cooldown window
- photo/story browsing inside the same modal session does not emit a new event
- reopen inside the cooldown window stays suppressed after reconnect/relaunch
- self preview never emits a profile-view event
