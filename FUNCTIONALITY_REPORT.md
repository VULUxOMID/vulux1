# Functionality Report

This report tracks the current Railway + Clerk target stack.

## Active Platform Ownership

- Authentication: Clerk.
- Durable data: Railway Postgres behind the Railway TypeScript API.
- API authorization: Clerk JWT verification in the Railway backend.
- Live-room control and RTC signaling: Railway WebSockets.
- Live media: WebRTC.
- Uploads: Railway signs R2 writes and stores media metadata.

## Current Migration Status

- The app is configured through `EXPO_PUBLIC_RAILWAY_API_BASE_URL` and `EXPO_PUBLIC_RAILWAY_WS_BASE_URL`.
- Clerk session access is centralized in `src/auth/clerkSession.tsx`.
- The removed realtime database generated client has been replaced by `src/lib/railwayRuntime.ts`, a temporary no-op bridge for screens that still need Railway-backed replacements.
- Root and backend env examples describe only Clerk, Railway, WebRTC, and R2.

## Remaining Engineering Work

- Replace `railwayRuntime.ts` no-op projections with real Railway API/WebSocket modules feature by feature.
- Move message, social, wallet, live-room, notification, media, and onboarding mutations fully behind Railway service routes.
- Add Railway backend tests for Clerk JWT verification, migrations, upload signing, WebSocket room routing, and RTC offer/answer/ICE routing.
