# Spacetime-Only Backend Audit

## Mobile Endpoints Audited

These are the HTTP endpoints referenced in the app code before the cutover, and what replaces them now.

| Endpoint | Previous purpose | Replacement |
| --- | --- | --- |
| `/snapshot` | Full backend data hydrate | Removed from normal runtime. The app now builds repositories directly from Spacetime subscriptions. |
| `/snapshot/patch` | Incremental backend hydrate | Removed from normal runtime. Spacetime data-change events trigger repository refreshes. |
| `/counts/unread` | Server unread badge counts | Removed. Tab badges now derive from local Spacetime-backed repositories. |
| `/profile` | Read presence/profile via backend | Removed from normal runtime. Profile state comes from `my_profile` / public profile data in Spacetime. |
| `/profile/update` | Persist profile updates | Replaced by Spacetime reducer `create_user_profile`. |
| `/account/state` | Read account state | Replaced by Spacetime view `my_account_state`. |
| `/account/state/upsert` | Persist account state | Replaced by Spacetime reducer `upsert_account_state`. |
| `/account/state/delete` | Delete account state | Replaced by a Spacetime tombstone update plus sign-out. |
| `/messages/thread/send` | Send DM message | Replaced by Spacetime reducer `send_thread_message`. |
| `/messages/conversation/mark-read` | Mark DM read | Replaced by Spacetime reducer `mark_conversation_read`. |
| `/notifications/mark-read` | Mark notification read | Client now applies local read state, with Spacetime-derived notification events remaining the source of truth. |
| `/notifications/mark-all-read` | Mark all notifications read | Client now applies local read state. |
| `/notifications/delete` | Delete notification | Client now applies local hidden state. |
| `/notifications/respond-friend-request` | Accept/decline friend request | Replaced by Spacetime reducer `respond_to_friend_request`. |
| `/notifications/send-friend-request` | Create friend request | Replaced by Spacetime reducer `send_friend_request`. |
| `/notifications/remove-friend-relationship` | Remove friend | Replaced by Spacetime reducer `remove_friend_relationship`. |
| `/social/update-status` | Presence status write | Replaced by Spacetime reducer `set_social_status`. |
| `/social/set-live` | Live status write | Replaced by Spacetime reducer `set_social_status`. |
| `/live/start` | Start live session | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/update` | Update live session | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/presence` | Presence heartbeat | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/ban` | Ban viewer | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/unban` | Unban viewer | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/end` | End live session | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/boost` | Boost live session | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/event/tick` | Live event timer tick | Replaced by Spacetime global-event mutation in `LiveContext`. |
| `/live/invite` | Invite another user into live | Replaced by a Spacetime global event (`live_invite`). |
| `/video/items` | Persist uploaded video metadata | Replaced by Spacetime catalog event (`video_catalog_item`). |
| `/music/tracks` | Persist uploaded track metadata | Replaced by Spacetime catalog event (`music_track_item`). |
| `/presign` | Presign R2 uploads | Moved into the signer-only service with Clerk JWT verification and no database dependency. |

## Optional Legacy Admin Endpoints

These still exist in the codebase as optional admin tooling only if you explicitly set `EXPO_PUBLIC_ADMIN_API_BASE_URL`:

- `/admin/*`
- `/api/admin/*`

They are no longer part of the app’s normal mobile runtime path.

## Files/Routes Removed Or Replaced

- [/Users/omid/vulux1/backend/src/server.js](/Users/omid/vulux1/backend/src/server.js)
  Replaced the old Express + Postgres API with a minimal Node HTTP upload signer (`GET /health`, `POST /presign`).
- `DATABASE_URL`
  No longer required anywhere in the runtime path.
- `pg`, `express`, `cors`, `ws`
  Removed from [/Users/omid/vulux1/backend/package.json](/Users/omid/vulux1/backend/package.json) because the signer has no database and uses no Express stack.

## What SpacetimeDB Owns Now

- User profile persistence
- Account state persistence
- Conversation history and replayable message history
- Notifications and friendship state
- Live state mutations
- Client-published video catalog metadata
- Client-published music catalog metadata
- Uploaded media metadata events
- Schema tables for `auditLogItem`, `moderationActionItem`, and `withdrawalRequestItem` in the Spacetime module source

## Remaining Constraint

R2 uploads still require a trusted signer because the app cannot safely hold Cloudflare R2 secrets. That signer is now the only server component left in the default runtime path.
