# GL-00 Go Live v1 Stabilization QA Checklist

Use this checklist after applying GL-00 split commits to validate baseline stability before follow-up tasks.

For release sign-off and two-device go-live coverage, use [GL-07](./GL-07-go-live-qa-matrix.md) as the primary runbook.

## Scope

- Typed live lifecycle reducers are used by the client.
- Public live presence data is available for room participant rendering.
- Live-room chat subscription is room-scoped.
- End/Leave UX behavior is consistent for host vs viewer.
- Go Live composer surfaces async start errors.

## Quick Smoke (Single Device)

1. Start a live with valid title and fuel.
2. Confirm navigation into `/live` succeeds and no crash occurs.
3. Send a chat message and verify it renders once in the room feed.
4. Minimize and restore the live overlay.
5. End (host) or leave (viewer) and verify return navigation.

## Two-Device Regression

1. Device A starts live as host.
2. Device B opens same live as viewer.
3. Presence updates:
   - B joins -> A sees watcher added.
   - B leaves -> A watcher count decreases.
4. Room-scoped chat:
   - A sends message -> B sees it in same live room.
   - B sends message -> A sees it in same live room.
   - Switch to another live and confirm previous room messages do not leak in.
5. Host vs viewer exit behavior:
   - Host uses exit action -> live ends for everyone.
   - Viewer uses exit action -> only viewer leaves; live remains active.

## Edge/Failure Checks

1. Go Live with empty/short title (<3 chars) is blocked with message.
2. Go Live with zero fuel is blocked with clear hint.
3. Simulate reducer/start failure and verify visible retry-friendly error text.
4. Attempt presence/chat after live end and verify graceful handling.

## Remaining Risks

- Presence freshness window may hide stale participants too aggressively under poor connectivity.
- Live-room query fallback relies on current view schema; schema drift can break subscription filtering.
- Reducer error mapping depends on message text matching and may need tightening with typed server error codes.

## Notes

- `src/features/home/HomeScreen.tsx` is intentionally excluded from GL-00 stabilization commits.
- Run required checks after split:
  - `git diff --check`
  - `npx tsc --noEmit`
