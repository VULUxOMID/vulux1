# VUL-72 Local Authenticated Web Smoke Profile

## Goal

Provide one reproducible local smoke flow for authenticated web routes:

`/ -> /go-live -> /live -> /`

without placeholder Clerk keys or manual credential setup.

## Preconditions

Set real values in `/Users/omid/vulux1/.env.local`:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

The command will fail fast if either value is missing or still a placeholder.

## Canonical Command

```bash
cd /Users/omid/vulux1
npm run smoke:web:auth
```

## What This Command Does

1. Validates Clerk env keys (no placeholder values).
2. Provisions an ephemeral Clerk QA user profile for this run.
3. Creates a short-lived Clerk sign-in ticket (fallback path only).
4. Starts Expo web locally on `http://127.0.0.1:19081` (or `QA_BASE_URL` if set).
5. Runs authenticated smoke with Playwright across:
   - `/`
   - `/go-live`
   - `/live`
   - back to `/`
6. Writes evidence log and screenshots to `/Users/omid/vulux1/docs/qa`.

## Evidence Artifacts

- Log: `/Users/omid/vulux1/docs/qa/vul-72-smoke-after.log`
- Screenshots:
  - `vul-72-after-home.png`
  - `vul-72-after-go-live.png`
  - `vul-72-after-live.png`
  - `vul-72-after-home-return.png`

## Security Notes

- No secrets are committed to the repo.
- The smoke flow does not print Clerk secret keys or tickets.
- The QA user password is generated per run and not logged.
