# Vulu Agent Runner

V1 automation runner for safe Codex work on the Vulu repo.

## What it does

- Receives Linear webhooks
- Verifies `Linear-Signature`
- Filters to safe issues only
- Routes issues to prompt templates
- Can run manual Codex tasks locally in an isolated git worktree
- Can chain the next eligible Linear issue locally when the runner is idle

Deprecated/disabled:

- GitHub Actions `repository_dispatch` Codex execution
- GitHub scheduled fallback sweep
- GitHub webhook completion loop

## Supported V1 scope

- frontend/UI work
- tests
- documentation
- read-only audits

Blocked in V1:

- production migrations
- auth cutovers
- destructive infra changes
- wallet/economy
- live/event widget work

## Local setup

1. Install dependencies:

```bash
cd /Users/omid/vulux1/tools/vulu-agent-runner
npm install
```

2. Create a config file from the example:

```bash
cp /Users/omid/vulux1/tools/vulu-agent-runner/config.example.json /Users/omid/vulux1/tools/vulu-agent-runner/config.local.json
```

3. Set env vars:

```bash
export VULU_AGENT_RUNNER_CONFIG=/Users/omid/vulux1/tools/vulu-agent-runner/config.local.json
export LINEAR_WEBHOOK_SECRET=...
export LINEAR_API_KEY=...
export LINEAR_TEAM_ID=...
export VULU_AGENT_TASK_TOKEN=...
export OPENCLAW_GATEWAY_URL=http://localhost:8080
export OPENCLAW_TOKEN=...
export OPENAI_API_KEY=...
```

4. Run the server:

```bash
cd /Users/omid/vulux1/tools/vulu-agent-runner
npm run serve
```

The server exposes:

- `GET /health`
- `POST /webhooks/linear`
- `POST /webhooks/task`

`POST /webhooks/task` accepts:

- `Authorization: Bearer <token>`
- JSON body with `text` or `task`

Manual task execution defaults to `local` and runs `codex exec` on the local
machine inside a dedicated git worktree under `tools/vulu-agent-runner/.data/runs`.
Each run writes `run.json`, `prompt.md`, `codex.log`, and `codex-last-message.txt`.

## Local autonomous loop

With the default config, the runner starts a small local poll loop:

- every 60 seconds
- only when there are no active local Codex runs
- dispatches at most one next eligible Linear issue

Eligibility still respects the same guardrails as the webhook/sweep path:

- allowed labels
- allowed states
- blocked labels
- safe issue types

This means the overnight chain no longer depends on the OpenClaw completion
callback succeeding.

## Official path

Official automation path:

```text
Linear -> local runner -> codex exec
```

The GitHub-hosted fallback path has been disabled and removed from
`.github/workflows` to avoid red status noise and confusion. If GitHub still
shows old failed runs, they are historical only.

## Prompt routing

Prompt routing is configured in `config.local.json`:

- allowed labels
- blocked labels
- safe issue types
- prompt templates
- label-to-template routes

All prompts are designed to stay compatible with `/Users/omid/vulux1/AGENTS.md`.

## Notes

- Local runs create commits inside their isolated worktrees when Codex makes changes.
- The local autonomous loop uses cooldown and lock state via the configured state file.
- `POST /webhooks/github` and `/internal/fallback-sweep` are deprecated compatibility paths and are no longer part of the official flow.
