# GL-07: Go Live QA Matrix and Regression Checklist

Living doc for Go Live validation. Keep this file updated as behavior evolves.

## Goal and Timebox
- Run with 2 people on 2 devices in under 10 minutes.
- Device A = Host account.
- Device B = Viewer account.
- Reuse one session where possible and mark multiple rows from one action.

## Quick Regression Run (<10 minutes)
Use this order for a fast go/no-go check. Mark the matching matrix IDs as you go.

1. Preflight both devices, then on Device A validate `GL07-H2` and `GL07-H3` before starting a real live.
2. Start one public live and pass `GL07-H1`.
3. From the same session, cover all primary viewer entry points:
   - Device B joins from Home for `GL07-J1`, leaves for `GL07-P2`.
   - Device B rejoins from Search for `GL07-J2` and confirms `GL07-P1`.
   - Device B opens the same live from Notifications for `GL07-J3`.
4. While both users are in-room, run `GL07-C1` and `GL07-C2`.
5. Set Device B fuel to `0`, then repeat one successful viewer entry path and pass `GL07-J6`.
6. Validate exit behavior in the same room: `GL07-E3`, then either `GL07-E1` or `GL07-E2`.
7. Run access control coverage with one invite-only room: `GL07-IB1`, `GL07-IB2`, and `GL07-IB3`.

If any row above fails, stop the go-live sign-off and file the bug before continuing.

## Preflight (30-60s)
- [ ] Both devices are signed in to different accounts in the same environment.
- [ ] Notifications are enabled on Device B.
- [ ] Device A has enough fuel for start/join flows except explicit `fuel = 0` test.
- [ ] Clear stale live state (both users not currently in a live room).
- [ ] If you will run `GL07-J4` or `GL07-J5`, prepare the stale/invalid deep link before starting the timed run.

## 1) Host Start Live
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-H1 | Device A on Go Live, title `"QA Smoke Live"`, fuel > 0. | Tap `Start Live`. | Host enters live room, room title matches input, live appears in discovery/search. |
| [ ] | GL07-H2 | Device A on Go Live, title shorter than 3 chars. | Tap `Start Live`. | Start is blocked; validation hint/toast indicates title is invalid; no live starts. |
| [ ] | GL07-H3 | Device A on Go Live with fuel set to 0. | Tap `Start Live`. | Start is blocked; out-of-fuel hint/toast is shown; no live starts. |
| [ ] | GL07-H4 | Device A has valid title + fuel. Prepare failure mode (QA fail toggle if available, otherwise force network/realtime failure before tap). | Tap `Start Live` once under failure mode. | Start fails safely: no live room entered, no orphan/duplicate live created, user can retry after restoring normal state. |
| [ ] | GL07-H5 | Device A has valid title + fuel. | Double-tap `Start Live` quickly. | Only one live session is created; single navigation to live screen; no duplicate room entries/cards. |

## 2) Viewer Join
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-J1 | Host live is running. Viewer on Home `Live now`. | Viewer joins from Home live card/preview. | Viewer enters correct live; host sees viewer count/presence update. |
| [ ] | GL07-J2 | Host live is running and indexed in Search. | Viewer joins from Search > Live result. | Viewer enters correct live; no fallback screen. |
| [ ] | GL07-J3 | Host sends/causes live notification to viewer. | Viewer opens live from Notification CTA. | Viewer opens matching `liveId`; host sees viewer present. |
| [ ] | GL07-J4 | Prepare invalid/stale live deep link/notification (`liveId` not found). | Viewer opens the invalid link. | App does not crash; viewer sees safe fallback (no live selected / return home path). |
| [ ] | GL07-J5 | Use a real live that has already ended. | Viewer attempts to open ended live from stale entry. | Viewer cannot rejoin ended room; ended/fallback state is shown clearly. |
| [ ] | GL07-J6 | Host live is running. Viewer fuel is `0`. | Viewer joins from any standard entry path (Home, Search, or Notification). | Viewer still joins successfully; no refuel gate blocks viewer-only entry; host sees presence update. |

## 3) Presence
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-P1 | Host and viewer both in same live. | Viewer joins and stays active. | Viewer appears in participants/watchers and viewer count increases. |
| [ ] | GL07-P2 | Viewer is present in host live. | Viewer leaves live normally (back/close). | Viewer disappears from participants/watchers and viewer count decreases. |
| [ ] | GL07-P3 | Viewer is present in host live. | Force-close viewer app or kill network without explicit leave; wait stale timeout window. | Stale viewer presence expires and is removed automatically within expected timeout window. |

## 4) Chat
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-C1 | Host and viewer in same live, chat visible. | Host sends message `"host->viewer smoke"`. | Viewer receives exactly once, in order, with correct sender identity. |
| [ ] | GL07-C2 | Same session as above. | Viewer sends message `"viewer->host smoke"`. | Host receives exactly once, in order, with correct sender identity. |
| [ ] | GL07-C3 | Complete one live chat exchange in Live A. | Switch both users to Live B. | Live B chat does not show Live A messages; message context is scoped per live. |
| [ ] | GL07-C4 | Host bans viewer in current live. | Banned viewer attempts to send chat. | Chat send is rejected (no delivery to host); user is removed/blocked from active participation. |
| [ ] | GL07-C5 | Host runs invite-only live; non-invited viewer attempts access. | Non-invited viewer tries to join and send chat. | Join is rejected and chat cannot be sent to that live. |

## 5) End Live
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-E1 | Host and viewer in active live (full-screen on host). | Host ends live from full-screen controls. | Live ends for all participants; viewer sees ended state; room closes cleanly. |
| [ ] | GL07-E2 | Host minimizes to PiP/overlay while live is active. | Host ends/leaves from PiP controls. | Live end behavior matches full-screen end: viewer gets remote-ended state and closure. |
| [ ] | GL07-E3 | Host and viewer in active live. | Viewer leaves live. | Viewer exits live; host live remains active and does not end. |
| [ ] | GL07-E4 | Host and viewer in active live. | Host ends live while viewer remains connected. | Viewer sees remote ended UX (banner/state) and auto/manual close path without crash. |

## 6) Invite-only + Ban
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-IB1 | Host starts invite-only live and explicitly invites viewer B. | Viewer B joins via invite path. | Invited viewer can join normally and appears in presence. |
| [ ] | GL07-IB2 | Same invite-only live; user C is not invited. | User C attempts to join. | Non-invited user is blocked from join with clear rejection UX. |
| [ ] | GL07-IB3 | Host bans user C for that live. | User C attempts to join again. | Banned user is blocked from join regardless of invite-only state. |
| [ ] | GL07-IB4 | User C is banned for that live. | User C attempts to send chat to that live. | Banned user cannot deliver chat messages into the live room. |

## 7) Web Compatibility
| Done | ID | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| [ ] | GL07-W1 | Open web app in browser devtools console. Focus the Go Live title input, then open and close Live Fuel. | Repeat open/close once with the title input previously focused. | No `NotSupportedError` or `AbortError` from ScreenOrientation; no `aria-hidden` focused-descendant warning on open/close. |
| [ ] | GL07-W2 | Join a live on web, open `Profile Views` or `Settings/Report/Invite`, focus a search/details input, then dismiss the sheet. | Close the overlay with backdrop tap, swipe, and explicit close path. | Focus leaves the hidden sheet before teardown; no browser console warning about `aria-hidden` retaining focus. |

## Pass Criteria
- [ ] All rows executed (or explicitly marked `N/A` with reason).
- [ ] Total runtime is <= 10 minutes for 2 people / 2 devices.
- [ ] Any failing row has linked bug ID and owner before Go Live sign-off.

## Regression Use
- Run this checklist after any change touching live start/join/presence/chat/moderation/end flows.
- Keep IDs stable (`GL07-*`) so results remain comparable across releases.

## Read-only Audit Notes
- Current UI behavior on 2026-03-13 only fuel-gates hosts. Viewer joins are still expected to work with `fuel = 0`, so `GL07-J6` should pass unless product behavior changes intentionally.
- `GL07-J4` and `GL07-J5` are route/deep-link safety checks. They can be prepared ahead of time, then executed quickly during the same regression session.
