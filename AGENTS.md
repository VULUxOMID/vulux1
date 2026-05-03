# Vulu Repo Guide

## Target Stack

- Expo app for iOS, Android, and web.
- Clerk for authentication.
- Railway Node/TypeScript backend for APIs, Postgres access, upload signing, background work, and WebSocket signaling.
- Railway Postgres for durable product data.
- WebRTC for live audio/video media.
- R2 for blob storage only.

Do not add alternate backend, auth, realtime, or worker-runtime paths. Existing references to retired systems are migration debt and should be replaced with Railway/Clerk seams before deletion.

## Repo Root Commands

Run from `/Users/omid/vulux1` unless a section says otherwise.

```bash
npm start
npm run android
npm run ios
npm run web
npm run dev
npm run build
npm run env:check
npm run smoke:web:auth
npx tsc --noEmit
git diff --check
```

## Railway Backend

Run from `/Users/omid/vulux1/backend`.

```bash
npm start
npm run smoke
```

Required backend env:

```bash
DATABASE_URL
CLERK_JWKS_URL
CLERK_JWT_ISSUER
CLERK_JWT_AUDIENCE
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
RTC_STUN_URLS
RTC_TURN_URLS
RTC_TURN_SECRET
```

## Safe Automation Scope

- Frontend/UI work, tests, documentation, and read-only audits are safe.
- Avoid production migrations, destructive infra changes, wallet/economy changes, and live/event widget behavior unless a human explicitly asks for them.
