# VUL-70 Authenticated Web Smoke Unblock

## Summary

Authenticated web smoke was blocked because Clerk may return a non-`complete` sign-in state (`needs_*`) and the login screen previously stopped at a generic pending-step message.

## 1) Exact Repro (Pending-Step Blocker)

Run the Clerk Frontend API repro script (no app changes needed):

```bash
cd /Users/omid/vulux1
QA_USERNAME='<qa-username>' \
QA_PASSWORD='<qa-password>' \
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='<your publishable key>' \
node scripts/qa/repro-clerk-pending-step.mjs
```

Observed output (captured):

```json
{
  "status": "needs_identifier",
  "client_trust_state": "pending",
  "supported_first_factors": [{ "strategy": "ticket" }],
  "supported_second_factors": null
}
```

Evidence log: `/Users/omid/vulux1/docs/qa/vul-70-pending-step-repro-log.txt`

## 2) Implemented Fix (Minimal Patch)

File patched: `/Users/omid/vulux1/src/features/auth/SpacetimeAuthScreen.tsx`

Changes:
- Login now uses explicit Clerk password strategy (`strategy: 'password'`).
- Handles `needs_first_factor` by attempting password first factor when available.
- Handles `needs_second_factor` by preparing and verifying email/phone code factors.
- Adds login UI for `Sign-in verification code` + `Verify` + `Resend` actions.
- Adds QA fallback for pending ticket flow:
  - if Clerk returns `needs_identifier` with `ticket` support, app consumes `EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET` automatically.

## 3) Deterministic Local Test Path

### A. Provision QA account (deterministic OTP path)

```bash
cd /Users/omid/vulux1
node --env-file=.env.local scripts/qa/provision-clerk-qa-user.mjs
```

This creates a user with `+clerk_test` email pattern and prints credentials.
If OTP challenge appears, use code: `424242`.

### B. Optional ticket fallback for pending `ticket` flow

```bash
cd /Users/omid/vulux1
QA_CLERK_USERNAME='<qa-username>' \
node --env-file=.env.local scripts/qa/generate-clerk-qa-ticket.mjs
```

Export the printed value before launching Expo web:

```bash
export EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET='<token>'
```

### C. Run authenticated smoke (`/go-live -> /live -> Home`)

Install Playwright helper dependency (one-time in local workspace):

```bash
cd /Users/omid/vulux1
npm install -D @playwright/test
```

Then run:

```bash
cd /Users/omid/vulux1
QA_BASE_URL='http://localhost:8081' \
QA_USERNAME='<qa-username>' \
QA_PASSWORD='<qa-password>' \
node scripts/qa/run-vul70-web-smoke.mjs
```

## 4) Required Env/Config Changes

Required for helper scripts:
- `CLERK_SECRET_KEY` (available via `.env.local` in this workspace)

Optional for app ticket fallback:
- `EXPO_PUBLIC_CLERK_QA_SIGN_IN_TICKET=<short-lived sign-in token>`

No Clerk dashboard setting changes are required for this patch to work.

## 5) Evidence (Logs/Screenshots)

Logs:
- `/Users/omid/vulux1/docs/qa/vul-70-pending-step-repro-log.txt`
- `/Users/omid/vulux1/docs/qa/vul-70-smoke-log.txt`

Screenshots:
- `/Users/omid/vulux1/docs/qa/vul-70-after-fix-home.png`
- `/Users/omid/vulux1/docs/qa/vul-70-after-fix-go-live.png`
- `/Users/omid/vulux1/docs/qa/vul-70-after-fix-live.png`
- `/Users/omid/vulux1/docs/qa/vul-70-after-fix-home-return.png`
