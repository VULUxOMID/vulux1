# Vulu Capability Report

This report is a static code scan of the current codebase. It lists what your app can do today, plus flows that are scaffolded/partial.

## 1) Auth and Session

- Sign up with SpacetimeAuth.
- Log in with SpacetimeAuth.
- Log out/clear session.
- Redirect authenticated users to app tabs.
- Redirect unauthenticated users to auth stack.

## 2) Home and Discovery

- Show home feed with live sections and widgets.
- Open global chat sheet from home.
- View friend live activity strip.
- Open friend live preview sheet.
- Open live rooms from live discovery.
- Open search from home.
- Trigger backend refresh and realtime subscriptions on focus.

## 3) Live Streaming

- Start a live stream with title.
- Start live as invite-only.
- Block start when title is too short.
- Block start when host fuel is empty.
- Join a live room.
- Switch between live rooms.
- Auto-join a live from route param.
- Minimize live to PiP overlay.
- Restore minimized live.
- Close live as viewer.
- Close live as host (with confirm).
- Send live chat messages.
- Show system live events in chat.
- Invite viewer to stream/co-host.
- Kick streamer/co-host.
- Remove streamer from active stream role.
- Ban user from live.
- Unban user from live.
- Edit live title (host options).
- Toggle mic mute/unmute.
- Boost live with multipliers.
- Show boost countdown and reset when expired.
- Show boost leaderboard and switch to other live from leaderboard.
- Show participants drawer.
- Show profile views modal.
- Send live invites to users/friends.
- Report live flow with reason/details/screenshot support.
- Auto-end behavior when host fuel drains out.
- Track live presence (hosting/watching).

## 4) Chat, DMs, and Messaging

- List conversations with unread counts.
- Open 1:1 DM thread.
- Mark conversation read.
- Message receipts: sending/sent/delivered/read/failed.
- Send text messages in DM.
- Reply to specific message in DM.
- Edit own message in DM.
- Delete message locally in DM UI.
- Copy message text.
- React to messages with emoji.
- Jump to replied message.
- Mention users with `@` autocomplete.
- Filter messages by `all/media/links/mentions` in DM.
- Attach and send image in DM (image picker flow).
- Render audio/voice message UI in DM.
- Send cash transfer message in DM.
- Deduct sender cash and credit recipient cash on successful cash message send.
- Show global chat with send/reply/edit/delete/copy/reactions.
- Search/filter global chat.
- Jump-to-message in global chat.
- Show unread/new-message indicator behavior in global chat.

## 5) Friends and Social Graph

- Build friend list from accepted relationships.
- View friends screen.
- Open friend profile.
- Update social status (`live/online/busy/offline/recent`) via repository.
- Set user live status via repository.
- Send friend request.
- Accept friend request.
- Decline friend request.
- Cancel/remove friend relationship.
- Friend request and relationship state derived from realtime/global events.

## 6) Search

- Global search index across users, conversations, and live rooms.
- Search tabs: `All`, `Friends`, `Live`, `People`, `Chat`.
- Open live from search result.
- Open DM from search result.
- Add-friends mode to open target profile for friend request action.

## 7) Notifications

- Notification tabs: `Requests`, `Mentions`, `Activity`.
- Load notifications by user.
- Mark one notification read.
- Mark all notifications read.
- Delete notification.
- Undo-style local hide behavior in notification UI.
- Group activity notifications.
- Friend request actions (accept/decline/cancel) from notification center.
- Deep links from notifications to DM/chat/live.
- Profile views aggregation modal.
- Announcement modal and settings modal scaffolding.

## 8) Video Platform

- Browse video feed and categories.
- Search videos and creators.
- Persist recent video searches in UI state.
- Open video details/player modal route.
- Watch trailer mode.
- Watch full playback mode.
- Swipe down to dismiss player.
- Show related videos.
- Lock premium videos behind wallet currency.
- Unlock premium videos with cash/gems.
- Upload videos from device media.
- Upload thumbnail image to storage (presigned URL flow).
- Upload video file to storage (presigned URL flow with progress).
- Create video item metadata in backend.
- Creator-mode gate: block publishing when creator flag is false.
- Like videos (local increment logic).
- Video mini-player state management in context.

## 9) Music Platform

- Browse tracks/artists/playlists.
- Play track audio.
- Pause/resume playback.
- Seek playback.
- Next/previous track.
- Queue management.
- Shuffle mode.
- Repeat modes (`off/all/one`).
- Mini player + full player.
- Track action menu.
- Create custom playlist.
- Add tracks to playlist.
- View playlist details.
- View artist details.
- Like/unlike track.
- Offline download toggle for tracks.
- Persist offline/liked/playlist state (AsyncStorage + backend account state).
- Offline library screen.
- Upload audio track file (document picker).
- Upload artwork image for track.
- Upload track/artwork to storage with presigned URL.
- Create music track record in backend.
- Music history screen with search.

## 10) Wallet, Economy, and Monetization

- Wallet balances: gems, cash, fuel.
- Add gems.
- Add cash.
- Spend gems.
- Spend cash.
- Exchange gems to cash.
- Exchange cash to gems.
- Add fuel minutes.
- Consume fuel minutes.
- Refuel with gems or cash packs.
- Buy gem packs (UI confirmation flow).
- Watch ad reward for gems in shop.
- Gem+ subscription UI state (subscribe/cancel/resume).
- AFK ad wall cash earning loop.
- Reward streak cash claims.
- Withdraw funds request (gems -> fiat-equivalent record).
- Store withdrawal history.
- Wallet history screen.
- Event raffle widget:
- Enter event by spending cash.
- Draw timer/progress.
- Winner announcement in global chat system message.
- Persist event widget state to backend account state.

## 11) Games and Play

- Slots game loop.
- Spin with bet and paylines.
- Free spins.
- Buy bonus round.
- Jackpot progression simulation.
- Win/loss handling tied to wallet cash.
- Daily claim streak reward in play tab.
- Game sound effects and haptics.
- Play tab routes to shop/earn.
- Clash of Drone screen exists as `Coming Soon`.
- Tycoon routes currently redirect to Clash of Drone hold screen.
- Hash Singularity route currently redirects to Clash of Drone hold screen.

## 12) Profile and Account

- View profile summary and stats.
- Open settings from profile.
- Edit profile (name + bio autosave).
- Manage profile photos:
- Add photo from library.
- Reorder photos by drag and drop.
- Delete photo.
- Select avatar from photos.
- Set status message and presence state.
- Presence status modal integration.
- Profile shortcuts to:
- Friends list.
- Friend requests tab.
- Profile views tab.
- Wallet/shop tab.
- Music widget.
- Account screen:
- Edit username.
- Edit display name.
- Attempt email/password updates (blocked by current auth mode).
- Delete account (session clear + best-effort backend account-state cleanup).
- Restore purchases button currently placeholder.
- Blocked users screen exists (currently local-only list state).

## 13) Navigation and Shell

- Bottom navigation with unread badges for notifications/messages.
- Floating menu quick-nav to music/videos/play/clash-of-drone/leaderboard/shop.
- Floating draggable menu with persisted position.
- Home tab scroll-to-top event.
- Global live PiP overlay across app.
- Global profile modal.
- Global track action menu.

## 14) Backend/API Capabilities Exposed

- `POST /webhooks/auth` for auth user sync/delete webhooks.
- `GET /admin/users` admin user listing.
- `POST /admin/wallet/credit` admin wallet crediting.
- `GET /health` health endpoint.
- `GET /metrics/realtime` realtime metrics endpoint.
- `GET /snapshot` data snapshot endpoint.
- `GET /snapshot/patch` incremental snapshot patch endpoint.
- `GET /counts/unread` unread counters endpoint.
- `GET /music/artists`, `GET /music/tracks`, `GET /music/playlists`.
- `POST /video/upload/url`, `POST /video/items`.
- `POST /music/upload/url`, `POST /music/tracks`.
- `POST /messages/thread/send`.
- `POST /messages/conversation/mark-read`.
- `POST /messages/global/send`.
- `POST /social/update-status`.
- `POST /social/set-live`.
- `POST /social/delete`.
- `POST /live/start`, `POST /live/update`, `POST /live/ban`, `POST /live/unban`, `POST /live/end`, `POST /live/invite`, `POST /live/presence`.
- `POST /notifications/mark-read`, `POST /notifications/mark-all-read`, `POST /notifications/delete`.
- `POST /notifications/respond-friend-request`, `POST /notifications/send-friend-request`, `POST /notifications/remove-friend-relationship`.
- `GET /profile`, `POST /profile/update`.
- `GET /account/state`, `POST /account/state/upsert`, `POST /account/state/delete`.
- Debug routes for storage diagnostics: `GET /debug/r2`, `GET /debug/presigned`.

## 15) Partial, Placeholder, or Local-Only Flows

- New group chat screen currently simulates success and goes back; no real group creation backend call.
- Blocked users page uses local state only; no persisted server-side block list.
- Some notification activity actions are placeholders (`open_rewards`, `open_trades`, etc.).
- Settings -> Notification row is placeholder (`console.log`).
- Account -> Restore Purchases is placeholder success toast.
- Clash of Drone and Tycoon game paths are hold/coming-soon redirects.
- DM voice recording hooks/state exist, but full record-upload-send voice pipeline is not fully wired like image/cash flows.
- `GET /admin/users` appears duplicated multiple times in backend route registration.

## 16) Key Sources Scanned

- `/app` routes and screens.
- `/src/context/*` providers.
- `/src/features/*` modules.
- `/src/data/contracts.ts` and backend adapters.
- `/src/lib/spacetimedb/*` schemas/reducers.
- `/backend/src/server.js` and `/backend/src/r2.js`.
