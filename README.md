# Vulu

## Target Architecture: Railway + Clerk + WebRTC + R2

Vulu is moving to one app-owned backend that is easier to inspect, test, and change agentically:

- `Clerk` owns authentication and session tokens.
- `Railway` hosts the Node/TypeScript API, WebSocket signaling, Postgres database, migrations, background jobs, and R2 upload signing.
- `WebRTC` carries live room audio/video through peer connections, with Railway only handling signaling and room control.
- `R2` stores uploaded media blobs. R2 is storage only, not an application runtime.
- `Expo` powers the iOS, Android, and web app surfaces.

The active direction is to keep one backend vocabulary in active development context: Clerk for auth, Railway for app services, WebRTC for media, and R2 for blob storage.

## Local App Setup

Create `/Users/omid/vulux1/.env.local`:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_or_live_value
EXPO_PUBLIC_RAILWAY_API_BASE_URL=http://127.0.0.1:3000
EXPO_PUBLIC_RAILWAY_WS_BASE_URL=ws://127.0.0.1:3000
EXPO_PUBLIC_RTC_ENABLE=1
```

Run the app:

```bash
cd /Users/omid/vulux1
npm start
npm run ios
npm run android
npm run web
```

## Railway Backend

The backend lives in `/Users/omid/vulux1/backend`.

```bash
cd /Users/omid/vulux1/backend
npm install
npm start
```

Railway backend env:

```env
PORT=3000
DATABASE_URL=postgresql://...
CLERK_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
CLERK_JWT_ISSUER=https://your-clerk-domain
CLERK_JWT_AUDIENCE=vulu-backend
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=https://media.your-domain.com
RTC_STUN_URLS=stun:stun.l.google.com:19302
RTC_TURN_URLS=
RTC_TURN_SECRET=
```

## Common Commands

```bash
npm run env:check
npm run smoke:web:auth
npx tsc --noEmit
git diff --check
```

Backend:

```bash
cd /Users/omid/vulux1/backend
npm run smoke
```

## Migration Rule

New product work should target Clerk and Railway only. Do not add new app dependencies on removed platform names or env variables. If a legacy import is still present, treat it as staged migration debt and replace it behind a Railway-backed seam before deleting it.
