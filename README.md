# Vulu

## Architecture: SpacetimeDB-only + Clerk + R2

The mobile app now treats SpacetimeDB as the primary application backend.

- Auth: Clerk issues the JWT used by the app and by the upload signer.
- App data: SpacetimeDB stores profiles, account state, live state, conversations, thread history, notifications, and client-published catalog events.
- Media storage: Cloudflare R2 stores uploaded files.
- Upload signing: a minimal Node HTTP signer in [/Users/omid/vulux1/backend/src/server.js](/Users/omid/vulux1/backend/src/server.js) validates Clerk JWTs and returns presigned R2 upload URLs from `POST /presign` (`GET /health` remains public).
- Legacy admin API: optional only. The app no longer depends on `EXPO_PUBLIC_API_BASE_URL` for normal runtime data.

### Local Run

1. Start the SpacetimeDB module you use for development (or point the app at your deployed module with `EXPO_PUBLIC_SPACETIMEDB_URI` and `EXPO_PUBLIC_SPACETIMEDB_NAME`).
2. Configure the upload signer with the vars from [/Users/omid/vulux1/backend/.env.example](/Users/omid/vulux1/backend/.env.example).
3. Start the signer:

```bash
cd /Users/omid/vulux1/backend
npm install
npm start
```

4. Ensure [/Users/omid/vulux1/.env.local](/Users/omid/vulux1/.env.local) contains:

```env
EXPO_PUBLIC_UPLOAD_SIGNER_URL=http://192.168.0.192:3000
EXPO_PUBLIC_BACKEND_TOKEN_TEMPLATE=vulu-backend
```

5. Start Expo:

```bash
cd /Users/omid/vulux1
npx expo start
```

No `DATABASE_URL` is required for the signer or the app runtime.

If you enforce `AUTH_JWT_AUDIENCE` in the signer, make sure your Clerk JWT template emits a matching `aud` claim.

### Local Smoke

For the authenticated local web smoke runner:

```bash
cd /Users/omid/vulux1
npm run smoke:web:auth:local
```

Preflight-only and artifact details are documented in [/Users/omid/vulux1/docs/qa/VUL-114-local-runner-smoke.md](/Users/omid/vulux1/docs/qa/VUL-114-local-runner-smoke.md).
