# VuluGO Documentation

This document is the current source of truth for VuluGO runtime setup during the SpacetimeDB migration.

## 1. Architecture & Deployment Rules

### Non-Negotiable Runtime Rules
1. **SpacetimeDB is the primary real-time data platform.**
2. **Railway deployment is retired** for this repo.
3. Optional HTTP API support is treated as **legacy compatibility only** for not-yet-migrated features.
4. Do not hardcode production endpoints or credentials in code/scripts.

### Platform Responsibilities
- **Codex / local dev**: main development environment for app and migration work.
- **Replit**: frontend/static preview only.
- **SpacetimeDB maincloud**: primary real-time backend target.
- **Legacy API runtime** (if used): self-managed and configured by env vars, not tied to Railway.

## 2. Environment Variables

### Required App Variables
```env
EXPO_PUBLIC_SPACETIMEDB_URI=wss://maincloud.spacetimedb.com
EXPO_PUBLIC_SPACETIMEDB_NAME=vulu
```

### Strongly Recommended App Variables
```env
EXPO_PUBLIC_BACKEND_TOKEN_TEMPLATE=vulu-backend
EXPO_PUBLIC_ENABLE_REALTIME=true
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_DATA_SOURCE=backend
```

### Optional Legacy API Variables (Compatibility Mode)
```env
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com
EXPO_PUBLIC_BACKEND_TIMEOUT_MS=15000
EXPO_PUBLIC_BACKEND_REHYDRATE_MS=30000
EXPO_PUBLIC_FAST_FALLBACK_REFRESH_MS=800
EXPO_PUBLIC_FULL_FALLBACK_REFRESH_MS=45000
```

### Verification Commands
Run from repo root:
- `npm run env:check` - app + SpacetimeDB focused checks
- `npm run env:check:legacy-api` - optional legacy API checks

## 3. Authentication (SpacetimeDB)

VuluGO uses SpacetimeDB-native authentication. Client identity and auth token are managed by the SpacetimeDB connection and persisted locally for session continuity.

## 4. QA & Deployment Workflow

### Go Live Regression Checklist
- GL-07 QA matrix: [docs/qa/GL-07-go-live-qa-matrix.md](docs/qa/GL-07-go-live-qa-matrix.md)

### Freshness Checklist
1. Commit and push changes.
2. Confirm deploy/build completed.
3. Use incognito/private window.
4. In DevTools Network tab, enable "Disable cache" and hard refresh.
5. Verify latest bundles are being served.

### Replit Static Preview
Use frontend/static flow only:
1. `npm run build`
2. `npx --yes serve dist -l 5000 --no-clipboard --cors --single`

### Triage Guidance
1. If Spacetime data is stale/missing, verify WebSocket connectivity and active subscriptions.
2. If a legacy API request fails, verify `EXPO_PUBLIC_API_BASE_URL` and auth token template.
3. For auth issues, verify SpacetimeDB URI/database env values and reconnect the client.
