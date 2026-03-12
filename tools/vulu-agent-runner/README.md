# Vulu Agent Runner

V1 automation runner for safe Codex work on the Vulu repo.

## What it does

- Receives Linear webhooks
- Verifies `Linear-Signature`
- Filters to safe issues only
- Routes issues to prompt templates
- Triggers GitHub `repository_dispatch`
- Provides a 10-minute fallback sweep

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
export GITHUB_DISPATCH_TOKEN=...
export VULU_AGENT_INTERNAL_TOKEN=...
export VULU_AGENT_TASK_TOKEN=...
export OPENCLAW_GATEWAY_URL=http://localhost:8080
export OPENCLAW_TOKEN=...
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
- `POST /webhooks/github`
- `POST /internal/fallback-sweep`

`POST /webhooks/task` accepts:

- `Authorization: Bearer <token>`
- JSON body with `text` or `task`

`POST /webhooks/github` accepts GitHub webhook payloads. When it receives a
`workflow_run` event with `action=completed`, it posts a completion callback to
OpenClaw using `OPENCLAW_GATEWAY_URL` and `OPENCLAW_TOKEN`.

## GitHub Actions setup

Repository secrets required:

- `OPENAI_API_KEY`
- `LINEAR_API_KEY`
- `VULU_AGENT_INTERNAL_TOKEN`

Optional repository variables:

- `VULU_AGENT_RUNNER_URL`
- `VULU_AGENT_CONFIG`

`VULU_AGENT_RUNNER_URL` should point to the running webhook receiver if you want the scheduled fallback workflow to call the live runner.

## Primary trigger model

- `pull_request.ready_for_review`
- `pull_request.synchronize`
- `push`
- Linear issue moved to `In Review`

GitHub completion signals are normalized into `repository_dispatch`.

Linear webhooks are handled by the runner service and also dispatched into `repository_dispatch`.

## 10-minute fallback

The fallback workflow runs every 10 minutes and calls the runner's `/internal/fallback-sweep` endpoint.

If you prefer GitHub-hosted sweeping later, the same runner can also be invoked with:

```bash
npm run fallback-sweep
```

## Prompt routing

Prompt routing is configured in `config.local.json`:

- allowed labels
- blocked labels
- safe issue types
- prompt templates
- label-to-template routes

All prompts are designed to stay compatible with `/Users/omid/vulux1/AGENTS.md`.

## Notes

- The workflow creates or updates a codex branch and PR when Codex produces changes.
- The workflow posts a status comment back to Linear when `LINEAR_API_KEY` and the issue id are available.
- The fallback sweep uses cooldown and lock state via the configured state file.
