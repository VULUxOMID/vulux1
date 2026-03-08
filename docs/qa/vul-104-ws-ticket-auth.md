# VUL-104: WebSocket Ticket Auth Hardening

## Scope

- Removed raw bearer token transport from the legacy backend realtime WebSocket handshake.
- Replaced the client handshake contract with:
  1. authenticated HTTPS `POST /realtime/tickets`
  2. WebSocket subprotocol carrying only a short-lived ticket
- Added a server-backed ticket issuer and tested one-time ticket store in the in-repo backend service.
- Added client tests covering initial connect and reconnect ticket refresh.

## Security tradeoff

- This repository does **not** contain the backend process that terminates `/realtime`.
- The in-repo client can stop sending the raw bearer token immediately.
- The external realtime service must mint and consume the short-lived ticket for the flow to work end-to-end.
- There is intentionally **no** fallback to raw bearer transport.

## Expected backend contract

- `POST /realtime/tickets`
  - authenticated with `Authorization: Bearer <viewer-jwt>` over HTTPS
  - responds with JSON `{ "ticket": "<short-lived-one-time-ticket>" }`
- `GET/WS /realtime`
  - accepts `Sec-WebSocket-Protocol` entries:
    - `vulu.realtime.v1`
    - `vulu.auth.ticket.<ticket>`
  - validates the ticket server-side
  - consumes the ticket so it cannot be reused

The repository now contains the issuer plus the one-time consume logic. The external realtime upgrade handler still needs to call the consume step during handshake.

## Evidence

### Before

- WebSocket handshake subprotocols included `vulu.auth.bearer.<raw-jwt>`

### After

- Ticket request happens over HTTPS
- WebSocket URL contains no auth token
- WebSocket subprotocols include `vulu.auth.ticket.<ticket>`

## Verification commands

```bash
cd /private/tmp/vul-104-ws-ticket-auth
npx tsx --test backend/src/realtimeTickets.test.mjs
npx tsx --test src/data/adapters/backend/realtimeClient.test.ts
npm run test:live-regression
```
