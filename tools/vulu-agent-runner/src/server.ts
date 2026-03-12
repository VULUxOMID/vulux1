import fs from "node:fs";
import crypto from "node:crypto";
import http, { IncomingMessage, ServerResponse } from "node:http";

import { loadConfig, resolveStateFile } from "./config.js";
import { evaluateIssueEligibility } from "./eligibility.js";
import { triggerRepositoryDispatch } from "./githubDispatch.js";
import { fetchIssueByIdentifier, handleLinearWebhook, runFallbackSweep, verifyLinearSignature } from "./linearWebhook.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { routePrompt } from "./promptRouter.js";
import { StateStore } from "./stateStore.js";
import type { DispatchPayload, GithubSignalContext } from "./types.js";
import { onCodexComplete } from "./vulu-integration/runner-webhook.js";

function usage(): never {
  throw new Error("Usage: tsx src/server.ts <serve|fallback-sweep|github-signal|print-prompt>");
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBearerToken(req: IncomingMessage): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "");
}

function extractIssueKey(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const match = text.match(/\b([A-Z]+-\d+)\b/);
  return match?.[1];
}

function buildWorkflowCompletionResult(event: Record<string, any>, ghEvent: string | undefined) {
  const run = event.workflow_run as Record<string, any> | undefined;
  return {
    workflowName: typeof run?.name === "string" ? run.name : undefined,
    runId: typeof run?.id === "number" || typeof run?.id === "string" ? run.id : undefined,
    status: typeof run?.status === "string" ? run.status : undefined,
    conclusion: typeof run?.conclusion === "string" || run?.conclusion === null ? run.conclusion : undefined,
    url: typeof run?.html_url === "string" ? run.html_url : undefined,
    branchName: typeof run?.head_branch === "string" ? run.head_branch : undefined,
    issueKey:
      extractIssueKey(run?.display_title) ??
      extractIssueKey(run?.head_branch) ??
      extractIssueKey(run?.name),
    repository: typeof event.repository?.full_name === "string" ? event.repository.full_name : undefined,
    source: ghEvent,
  };
}

function inferGithubSignal(eventName: string, eventPath: string): GithubSignalContext {
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8")) as Record<string, any>;
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const eventId = process.env.GITHUB_RUN_ID ?? `${eventName}-${Date.now()}`;

  if (eventName === "pull_request") {
    const pr = event.pull_request;
    const labels = (pr?.labels ?? []).map((label: { name: string }) => label.name);
    const issueKey =
      extractIssueKey(pr?.title) ??
      extractIssueKey(pr?.body) ??
      extractIssueKey(pr?.head?.ref);

    return {
      eventName,
      eventId,
      repository,
      refName: pr?.head?.ref,
      pullRequestNumber: pr?.number,
      issueKey,
      labels,
    };
  }

  if (eventName === "push") {
    const refName = String(event.ref ?? "").replace("refs/heads/", "");
    const issueKey = extractIssueKey(refName) ?? extractIssueKey(event.head_commit?.message);
    return {
      eventName,
      eventId,
      repository,
      refName,
      issueKey,
      labels: [],
    };
  }

  return {
    eventName,
    eventId,
    repository,
    labels: [],
  };
}

async function runGithubSignal(): Promise<void> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventName || !eventPath) {
    throw new Error("GITHUB_EVENT_NAME and GITHUB_EVENT_PATH are required");
  }

  const config = loadConfig();
  const signal = inferGithubSignal(eventName, eventPath);
  if (!signal.issueKey) {
    logInfo("Skipping GitHub signal without Linear issue key", { ...signal });
    return;
  }

  const issue = await fetchIssueByIdentifier(signal.issueKey);
  if (!issue) {
    logWarn("Skipping GitHub signal without matching Linear issue", { ...signal });
    return;
  }

  const eligibility = evaluateIssueEligibility(issue, config.linear);
  if (!eligibility.eligible) {
    logInfo("Skipping ineligible GitHub signal", {
      issue: issue.identifier,
      reason: eligibility.reason,
    });
    return;
  }

  const routed = routePrompt(issue, config);
  const payload: DispatchPayload = {
    source: signal.eventName === "pull_request" ? "github-pr" : "github-push",
    eventId: signal.eventId,
    lockKey: signal.pullRequestNumber
      ? `pr:${signal.pullRequestNumber}`
      : `branch:${signal.refName ?? issue.identifier}`,
    branchName: signal.refName ?? `${config.github.branchPrefix}${issue.identifier.toLowerCase()}`,
    issue: {
      ...issue,
      branchName: signal.refName,
      prNumber: signal.pullRequestNumber,
    },
    prompt: routed.prompt,
    templateKey: routed.templateKey,
    repoOwner: config.github.owner,
    repoName: config.github.repo,
    branchPrefix: config.github.branchPrefix,
    baseBranch: config.github.baseBranch,
  };

  await triggerRepositoryDispatch(payload, config);
  logInfo("Dispatched GitHub completion signal", {
    issue: issue.identifier,
    source: payload.source,
  });
}

async function printPrompt(): Promise<void> {
  const issueKey = process.env.VULU_AGENT_ISSUE_KEY;
  if (!issueKey) {
    throw new Error("VULU_AGENT_ISSUE_KEY is required for print-prompt");
  }
  const config = loadConfig();
  const issue = await fetchIssueByIdentifier(issueKey);
  if (!issue) {
    throw new Error(`No Linear issue found for ${issueKey}`);
  }
  const routed = routePrompt(issue, config);
  process.stdout.write(`${routed.prompt}\n`);
}

function buildManualPrompt(taskText: string): string {
  return [
    "Use /Users/omid/vulux1/AGENTS.md as the governing instruction set.",
    "Treat this as a safe Vulu Codex task.",
    "Allowed scope only: frontend/UI work, tests, documentation, and read-only audits.",
    "Do not perform production migrations, auth cutovers, destructive infra changes, or changes to wallet/economy or live/event widget logic.",
    "If the task is unsafe or outside V1 scope, stop and report that clearly.",
    "",
    "Requested task:",
    taskText.trim(),
  ].join("\n");
}

async function handleManualTask(req: IncomingMessage, res: ServerResponse, config: ReturnType<typeof loadConfig>): Promise<void> {
  const expectedToken = process.env.VULU_AGENT_TASK_TOKEN ?? process.env.VULU_AGENT_INTERNAL_TOKEN;
  const bearer = readBearerToken(req);
  if (!expectedToken || bearer !== expectedToken) {
    sendJson(res, 401, { ok: false, reason: "unauthorized" });
    return;
  }

  const rawBody = await readRawBody(req);
  const parsed = JSON.parse(rawBody.toString("utf8")) as { text?: string; task?: string };
  const taskText = parsed.text?.trim() || parsed.task?.trim();
  if (!taskText) {
    sendJson(res, 400, { ok: false, reason: "missing_task" });
    return;
  }

  const digest = crypto.createHash("sha256").update(taskText).digest("hex").slice(0, 12);
  const eventId = `manual-${Date.now()}-${digest}`;
  const payload: DispatchPayload = {
    source: "manual-task",
    eventId,
    lockKey: `manual:${digest}`,
    branchName: `${config.github.branchPrefix}manual-${digest}`,
    issue: {
      id: "",
      identifier: "MANUAL-TASK",
      title: taskText.slice(0, 120),
      description: taskText,
      labels: ["agent-ready", "manual-task"],
      issueType: "chore",
      stateName: "Manual",
    },
    prompt: buildManualPrompt(taskText),
    templateKey: "default",
    repoOwner: config.github.owner,
    repoName: config.github.repo,
    branchPrefix: config.github.branchPrefix,
    baseBranch: config.github.baseBranch,
  };

  await triggerRepositoryDispatch(payload, config);
  sendJson(res, 200, {
    ok: true,
    dispatched: true,
    source: "manual-task",
    eventId,
    branchName: payload.branchName,
  });
}

async function startServer(): Promise<void> {
  const config = loadConfig();
  const stateStore = new StateStore(resolveStateFile(config));
  const port = Number(process.env.PORT ?? config.runner.listenPort);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "POST" && req.url === "/webhooks/linear") {
        const rawBody = await readRawBody(req);
        if (!verifyLinearSignature(req.headers["linear-signature"] as string | undefined, rawBody)) {
          return sendJson(res, 401, { ok: false, reason: "invalid_signature" });
        }
        const result = await handleLinearWebhook(config, stateStore, rawBody);
        return sendJson(res, result.statusCode, JSON.parse(result.body));
      }

      if (req.method === "POST" && req.url === "/internal/fallback-sweep") {
        const bearer = readBearerToken(req);
        const secret = process.env.VULU_AGENT_INTERNAL_TOKEN;
        if (!secret || bearer !== secret) {
          return sendJson(res, 401, { ok: false, reason: "unauthorized" });
        }
        const count = await runFallbackSweep(config, stateStore);
        return sendJson(res, 200, { ok: true, dispatched: count });
      }

      if (req.method === "POST" && req.url === "/webhooks/task") {
        await handleManualTask(req, res, config);
        return;
      }


      if (req.method === "POST" && req.url === "/webhooks/github") {
        const rawBody = await readRawBody(req);
        let event: Record<string, any> = {};
        try {
          event = JSON.parse(rawBody.toString("utf8")) as Record<string, any>;
        } catch {
          return sendJson(res, 400, { ok: false, reason: "invalid_json" });
        }
        const ghEvent = req.headers["x-github-event"] as string | undefined;
        logInfo("GitHub webhook received", { event: ghEvent, action: event.action });
        if (ghEvent === "workflow_run") {
          const run = event.workflow_run as Record<string, any> | undefined;
          const status = run?.status;
          const conclusion = run?.conclusion;
          const name = run?.name;
          const url = run?.html_url;
          logInfo("Workflow run update", { name, status, conclusion, url });
          if (event.action === "completed" && run?.id != null) {
            const taskId = String(run.id);
            const success = conclusion === "success";
            await onCodexComplete(taskId, success, buildWorkflowCompletionResult(event, ghEvent));
          }
        }
        return sendJson(res, 200, { ok: true, received: ghEvent });
      }

      return sendJson(res, 404, { ok: false, reason: "not_found" });
    } catch (error) {
      logError("Runner request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return sendJson(res, 500, {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.listen(port, () => {
    logInfo("Vulu Agent Runner listening", { port, stateFile: resolveStateFile(config) });
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    usage();
  }

  if (command === "serve") {
    await startServer();
    return;
  }

  if (command === "fallback-sweep") {
    const config = loadConfig();
    const stateStore = new StateStore(resolveStateFile(config));
    const count = await runFallbackSweep(config, stateStore);
    logInfo("Fallback sweep complete", { dispatched: count });
    return;
  }

  if (command === "github-signal") {
    await runGithubSignal();
    return;
  }

  if (command === "print-prompt") {
    await printPrompt();
    return;
  }

  usage();
}

main().catch((error) => {
  logError("Runner failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
