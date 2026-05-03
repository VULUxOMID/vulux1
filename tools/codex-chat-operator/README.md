# Codex Chat Operator

This replaces the "same prompt every 5 minutes in a new chat" pattern with a
small stateful operator.

## What it changes

- one registry of active tasks and runs
- duplicate protection by `taskId` and branch
- single active run on the shared operator tab
- one dispatch action per real task
- conservative auto-completion after repeated idle probes
- AppleScript/Chrome transport only
- dry-run mode before any browser automation

## Why this is safer

The old workflow created overlapping work because it had no memory. This one
adds memory:

- task registry
- active run lock
- branch ownership
- explicit completion state
- stale-run recovery

That means the sender can refuse to start `VUL-170` again if a `VUL-170` run is
already active.

## Files

- `index.mjs`: CLI entrypoint
- `lib/state.mjs`: task and run registry
- `lib/prompt.mjs`: strict prompt builder
- `lib/chromeTransport.mjs`: `osascript -> Chrome -> JS injection`

State is stored in:

- `tools/codex-chat-operator/.data/state.json`
- `tools/codex-chat-operator/.data/runs/<run-id>/prompt.md`

## Commands

Queue a task:

```bash
node tools/codex-chat-operator/index.mjs enqueue-task \
  --task-id VUL-170 \
  --title "Consolidate Clerk auth flow" \
  --branch codex/vul-170 \
  --base-commit $(git rev-parse HEAD) \
  --ticket-url https://linear.app/vulu/issue/VUL-170 \
  --expected-files src/auth/clerkSession.tsx,src/features/auth/ClerkAuthScreen.tsx,src/config \
  --body-file /absolute/path/to/task-prompt.md
```

Preview the exact prompt without opening Chrome:

```bash
node tools/codex-chat-operator/index.mjs dispatch-next --task-id VUL-170 --dry-run
```

Send the next pending task to Codex:

```bash
node tools/codex-chat-operator/index.mjs dispatch-next
```

Probe the current active run and update its status:

```bash
node tools/codex-chat-operator/index.mjs probe-active-run
```

List task state:

```bash
node tools/codex-chat-operator/index.mjs list
```

Manually mark a run complete if the browser probe is unsure:

```bash
node tools/codex-chat-operator/index.mjs complete-run \
  --run-id vul-170-1234567890-ab12cd \
  --status done \
  --chat-url https://chatgpt.com/codex/...
```

## Recommended workflow

1. Keep one operator chat open at `https://chatgpt.com/codex`.
2. Queue one task per real ticket or isolated work item.
3. Dispatch only when there is no active duplicate run.
4. Let the scheduler auto-complete obviously idle runs after two idle probes.
5. Use `complete-run` only when the automatic probe is unsure.
5. Retry explicitly. Do not use a timer that blindly resends.

## Notes on transport

The browser automation intentionally matches the known constraints:

- uses `osascript`
- targets `https://chatgpt.com/codex`
- waits for `.ProseMirror`
- finds the submit button by `aria-label="Submit"`
- pastes via clipboard and `cmd+v`

This tool is intentionally conservative. It is better to skip one dispatch than
to create duplicate branches and PRs again.

## Scheduler behavior

The recommended `launchd` setup calls `dispatch-wrapper.sh` every 5 minutes.
Each pass does this:

1. recover runs stuck longer than the stale timeout
2. probe the single active run, if any
3. auto-complete that run only after repeated idle probes
4. dispatch the next pending task only when there is no active run left
