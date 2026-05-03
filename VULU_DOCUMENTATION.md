# Vulu Documentation

## Current Stack

- Expo powers the native and web app surfaces.
- Clerk owns authentication and session tokens.
- Railway owns the TypeScript API, Postgres data, background jobs, upload signing, and WebSocket signaling.
- WebRTC carries live audio/video media.
- R2 stores uploaded blobs; Railway records metadata and signs uploads.

## Environment

App env:

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_RAILWAY_API_BASE_URL=
EXPO_PUBLIC_RAILWAY_WS_BASE_URL=
EXPO_PUBLIC_RTC_ENABLE=1
```

Railway backend env:

```bash
DATABASE_URL=
CLERK_JWKS_URL=
CLERK_JWT_ISSUER=
CLERK_JWT_AUDIENCE=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_BASE_URL=
RTC_STUN_URLS=
RTC_TURN_URLS=
RTC_TURN_SECRET=
```

## Commands

```bash
npm start
npm run ios
npm run web
npm run env:check
npx tsc --noEmit
```

Backend:

```bash
cd backend
npm start
npm run smoke
```
