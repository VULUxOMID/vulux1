# VUL-114 Local Runner Smoke Test

## Goal

Make the local authenticated web smoke flow reproducible from a fresh local runner setup, with an explicit preflight and one canonical command.

## Canonical Commands

Preflight only:

```bash
cd /Users/omid/vulux1
npm run smoke:web:auth:check
```

Preflight + run:

```bash
cd /Users/omid/vulux1
npm run smoke:web:auth:local
```

## Required Local Inputs

Set real values in `/Users/omid/vulux1/.env.local`:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

The preflight fails if either value is missing or still a placeholder.

## One-Time Local Dependency

If Playwright Chromium is not installed yet, run:

```bash
cd /Users/omid/vulux1
npx playwright install chromium
```

## What The Local Runner Does

1. Verifies required Clerk env vars.
2. Verifies the Playwright Chromium browser is available locally.
3. Provisions an ephemeral Clerk QA user for the run.
4. Creates a short-lived QA sign-in ticket.
5. Starts Expo web locally on `http://127.0.0.1:19081` unless `QA_BASE_URL` overrides it.
6. Runs authenticated smoke across `/`, `/go-live`, `/live`, then back to `/`.
7. Writes log and screenshots to `/Users/omid/vulux1/docs/qa`.

## Evidence Artifacts

- Log: `/Users/omid/vulux1/docs/qa/vul-72-smoke-after.log`
- Screenshots:
  - `vul-72-after-home.png`
  - `vul-72-after-go-live.png`
  - `vul-72-after-live.png`
  - `vul-72-after-home-return.png`

## Notes

- The runner does not print the Clerk secret key or QA sign-in ticket.
- `QA_BASE_URL` must be an absolute URL if you override the default local port.
