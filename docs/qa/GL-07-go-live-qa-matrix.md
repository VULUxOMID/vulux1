# GL-07: Go Live QA Matrix and Regression Checklist

Purpose: fast 2-device smoke test plus full regression matrix for Go Live.

## Test Setup
- Device A: Host account.
- Device B: Viewer account.
- Same app environment on both devices (`maincloud` + `vulu-spacetime`).
- Use unique live titles per run (`QA-LIVE-A`, `QA-LIVE-B`, etc.).

## Quick Run (<10 min, 2 devices)
- [ ] Q1 Start live: A starts `QA-LIVE-A` with valid title and fuel > 0. Live opens and appears on Home/discovery.
- [ ] Q2 Join + presence: B joins from Home. A sees viewer count/presence increase.
- [ ] Q3 Chat both ways: A sends `host->viewer`, B sends `viewer->host`. Both messages are delivered once and in order.
- [ ] Q4 Raise-hand: B taps hand button. A sees host-request system flow (`requested to join as co-host`), not a plain `👋` chat emoji.
- [ ] Q5 Ban force-out: A bans B. B is forced out immediately.
- [ ] Q6 Ban enforcement: B cannot rejoin the same live, cannot send live chat, and cannot keep/update live presence.
- [ ] Q7 End live + ghost-live: A ends live. `QA-LIVE-A` disappears from Home/discovery on both devices within ~1-2 seconds.
- [ ] Q8 Start second live + chat isolation: A starts `QA-LIVE-B`, B joins. Chat list is cleared/scoped to `QA-LIVE-B` (no messages from `QA-LIVE-A`).
- [ ] Q9 Leave parity: B leaves `QA-LIVE-B`; A remains live. A then ends live; B gets live-ended state.
- [ ] Q10 Invite-only: A starts invite-only live; B (not invited) is blocked from join with clear UX.
- [ ] Q11 Not found/ended: B opens stale or invalid live id. App shows safe fallback/live-ended behavior, no crash.
- [ ] Q12 Fuel/start failure: On A with fuel=0 (or forced start failure), start is blocked with clear UX and no orphan live.

## Full Regression Matrix
| ID | Area | Setup | Action | Expected |
| --- | --- | --- | --- | --- |
| GL07-S1 | Host start (valid) | A has fuel > 0, title length >= 3 | Tap Start Live | A enters live; live appears on Home/discovery |
| GL07-S2 | Host start (invalid title) | A title length < 3 | Tap Start Live | Start blocked; validation message shown |
| GL07-S3 | Host start (fuel=0) | A fuel = 0 | Tap Start Live | Start blocked; out-of-fuel UX shown |
| GL07-S4 | Host start (failure path) | Simulate realtime/network failure | Tap Start Live once | No orphan/duplicate live; retry possible |
| GL07-J1 | Join from Home | A live active | B taps Home live card | B enters correct live |
| GL07-J2 | Join from Search/notification | A live active | B joins via Search or notification | B enters correct live |
| GL07-J3 | Live not found | Invalid/stale live id | B opens link/notification | Safe fallback; no crash |
| GL07-J4 | Live ended open | Live already ended | B tries open | Live-ended UX; cannot rejoin ended room |
| GL07-P1 | Presence join | A live active | B joins | B appears in participants/watchers and viewer count increments |
| GL07-P2 | Presence leave | A and B in live | B leaves | B removed from participants/watchers and viewer count decrements |
| GL07-C1 | Chat host->viewer | A and B in same live | A sends text | B receives once, ordered, correct sender |
| GL07-C2 | Chat viewer->host | A and B in same live | B sends text | A receives once, ordered, correct sender |
| GL07-C3 | Chat room scope | `QA-LIVE-A` had chat; `QA-LIVE-B` active | B switches/joins `QA-LIVE-B` | Chat list shows only `QA-LIVE-B` context |
| GL07-M1 | Kick | A host, B in live | A kicks B | B is removed from stream/room per UX and cannot keep interacting as active participant |
| GL07-M2 | Ban force exit | A host, B in live | A bans B | B forced out immediately |
| GL07-M3 | Ban rejoin block | B banned in live | B tries rejoin | Join rejected with clear banned UX |
| GL07-M4 | Ban chat/presence block | B banned in live | B sends chat / updates presence | Server rejects; no delivery/no active presence in that live |
| GL07-I1 | Invite-only block | A invite-only live | B not invited tries join | Join blocked with clear invite-only UX |
| GL07-I2 | Invite-only allow | A invite-only live, B invited | B joins | Join succeeds |
| GL07-R1 | Raise-hand behavior | A host, B viewer in live | B taps hand button | Host-request/invitation-request flow occurs; no plain emoji chat action |
| GL07-E1 | End live (full screen) | A and B in live | A ends from full-screen | Live ends for both; B sees live-ended UX |
| GL07-E2 | End/leave parity | A and B in live | B leaves first; A stays live; then A ends | B leave does not end live; host end closes live for all |
| GL07-G1 | Ghost-live cleanup | A ends/leaves host live | Observe Home/discovery on both | Live removed quickly; no zero-host stale cards |

## Pass Criteria
- [ ] Quick Run (`Q1-Q12`) passes on 2 devices in under 10 minutes.
- [ ] Every failed row has a linked bug ID before sign-off.
- [ ] No blocker regressions in ban/kick, ghost-live cleanup, or raise-hand behavior.

## How To Run Fast On 2 Devices
1. Run `Q1-Q7` in one live session (`QA-LIVE-A`) to cover start/join/presence/chat/raise-hand/ban/ghost-live.
2. Immediately run `Q8-Q9` in a second live session (`QA-LIVE-B`) for chat isolation + leave/end parity.
3. Run `Q10-Q12` as targeted checks (invite-only, not-found/ended, fuel/start-failure).
