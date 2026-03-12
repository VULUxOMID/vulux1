import crypto from "node:crypto";

import { getRequiredEnv } from "./config.js";
import { evaluateIssueEligibility } from "./eligibility.js";
import { triggerRepositoryDispatch } from "./githubDispatch.js";
import { logInfo } from "./logger.js";
import { routePrompt } from "./promptRouter.js";
import type { DispatchPayload, RunnerConfig, RunnerIssue } from "./types.js";
import type { StateStore } from "./stateStore.js";

interface LinearIssueResponse {
  data?: {
    issue?: {
      id: string;
      identifier: string;
      title: string;
      description?: string | null;
      url?: string | null;
      priorityLabel?: string | null;
      state?: { name?: string | null } | null;
      labels?: { nodes: Array<{ name: string }> } | null;
      team?: { key?: string | null } | null;
      assignee?: { name?: string | null } | null;
      project?: { name?: string | null } | null;
      type?: { name?: string | null } | null;
    } | null;
  };
}

const ISSUE_BY_ID_QUERY = `
  query IssueById($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      url
      state { name }
      labels { nodes { name } }
      type { name }
    }
  }
`;

const ISSUE_LIST_QUERY = `
  query IssuesForSweep($first: Int!) {
    issues(first: $first, orderBy: updatedAt) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        state { name }
        labels { nodes { name } }
        type { name }
      }
    }
  }
`;

const RECENT_ISSUES_QUERY = `
  query RecentIssues($first: Int!) {
    issues(first: $first, orderBy: updatedAt) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        state { name }
        labels { nodes { name } }
        type { name }
      }
    }
  }
`;

async function linearGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = getRequiredEnv("LINEAR_API_KEY");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "authorization": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear GraphQL failed: ${response.status} ${await response.text()}`);
  }

  const parsed = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new Error(`Linear GraphQL error: ${parsed.errors.map((entry) => entry.message).join("; ")}`);
  }
  return parsed;
}

function buildIssue(graphqlIssue: NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]>): RunnerIssue {
  return {
    id: graphqlIssue.id,
    identifier: graphqlIssue.identifier,
    title: graphqlIssue.title,
    description: graphqlIssue.description ?? "",
    url: graphqlIssue.url ?? "",
    stateName: graphqlIssue.state?.name ?? "",
    labels: graphqlIssue.labels?.nodes.map((entry) => entry.name) ?? [],
    issueType: graphqlIssue.type?.name ?? "",
  };
}

export function verifyLinearSignature(signatureHeader: string | undefined, rawBody: Buffer): boolean {
  const secret = getRequiredEnv("LINEAR_WEBHOOK_SECRET");
  if (!signatureHeader) {
    return false;
  }
  const headerSignature = Buffer.from(signatureHeader, "hex");
  const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest();
  if (headerSignature.length !== computedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(headerSignature, computedSignature);
}

export async function fetchIssueById(issueId: string): Promise<RunnerIssue> {
  const response = await linearGraphql<LinearIssueResponse>(ISSUE_BY_ID_QUERY, { id: issueId });
  const issue = response.data?.issue;
  if (!issue) {
    throw new Error(`Linear issue not found for id ${issueId}`);
  }
  return buildIssue(issue);
}

export async function fetchIssueByIdentifier(identifier: string): Promise<RunnerIssue | null> {
  const response = await linearGraphql<{
    data?: {
      issues?: {
        nodes: Array<NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]> & { updatedAt?: string | null }>;
      };
    };
  }>(RECENT_ISSUES_QUERY, { first: 250 });
  const issue = response.data?.issues?.nodes.find((entry) => entry.identifier === identifier);
  if (!issue) {
    return null;
  }
  return buildIssue(issue);
}

export async function runFallbackSweep(config: RunnerConfig, stateStore: StateStore): Promise<number> {
  const response = await linearGraphql<{
    data?: {
      issues?: {
        nodes: Array<
          NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]> & { updatedAt?: string | null }
        >;
      };
    };
  }>(ISSUE_LIST_QUERY, { first: 100 });

  const cooldownMs = config.runner.cooldownMinutes * 60_000;
  const lookbackMs = config.runner.fallbackLookbackMinutes * 60_000;
  const now = Date.now();
  let dispatched = 0;

  for (const rawIssue of response.data?.issues?.nodes ?? []) {
    const issue = buildIssue(rawIssue);
    const updatedAt = rawIssue.updatedAt ? Date.parse(rawIssue.updatedAt) : 0;
    if (!updatedAt || now - updatedAt > lookbackMs) {
      continue;
    }
    const eligibility = evaluateIssueEligibility(issue, config.linear);
    if (!eligibility.eligible) {
      continue;
    }
    const fingerprint = `fallback:${issue.id}:${rawIssue.updatedAt ?? ""}`;
    const processedKey = `linear:${issue.id}`;
    const lockKey = `issue:${issue.identifier}`;
    if (!stateStore.shouldProcess(processedKey, fingerprint, cooldownMs)) {
      continue;
    }
    if (!stateStore.acquireLock(lockKey, "fallback-sweep", config.runner.lockTtlMinutes * 60_000)) {
      continue;
    }
    try {
      const routed = routePrompt(issue, config);
      const payload: DispatchPayload = {
        source: "linear-fallback",
        eventId: fingerprint,
        lockKey,
        branchName: `${config.github.branchPrefix}${issue.identifier.toLowerCase()}`,
        issue,
        prompt: routed.prompt,
        templateKey: routed.templateKey,
        repoOwner: config.github.owner,
        repoName: config.github.repo,
        branchPrefix: config.github.branchPrefix,
        baseBranch: config.github.baseBranch,
      };
      await triggerRepositoryDispatch(payload, config);
      stateStore.markProcessed(processedKey, fingerprint);
      dispatched += 1;
    } finally {
      stateStore.releaseLock(lockKey);
    }
  }

  return dispatched;
}

export async function handleLinearWebhook(
  config: RunnerConfig,
  stateStore: StateStore,
  rawBody: Buffer,
): Promise<{ statusCode: number; body: string }> {
  const payload = JSON.parse(rawBody.toString("utf8")) as {
    action?: string;
    data?: { id?: string };
    webhookTimestamp?: number;
  };

  if (typeof payload.webhookTimestamp !== "number" || Math.abs(Date.now() - payload.webhookTimestamp) > 60_000) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, reason: "invalid_timestamp" }),
    };
  }

  if (!payload.data?.id) {
    return {
      statusCode: 202,
      body: JSON.stringify({ ok: true, skipped: "missing_issue_id" }),
    };
  }

  const issue = await fetchIssueById(payload.data.id);
  const eligibility = evaluateIssueEligibility(issue, config.linear);
  if (!eligibility.eligible) {
    return {
      statusCode: 202,
      body: JSON.stringify({ ok: true, skipped: eligibility.reason }),
    };
  }

  const fingerprint = `linear:${payload.action ?? "unknown"}:${issue.id}:${payload.webhookTimestamp}`;
  const processedKey = `linear:${issue.id}`;
  const lockKey = `issue:${issue.identifier}`;
  if (!stateStore.shouldProcess(processedKey, fingerprint, config.runner.cooldownMinutes * 60_000)) {
    return {
      statusCode: 202,
      body: JSON.stringify({ ok: true, skipped: "cooldown" }),
    };
  }

  if (!stateStore.acquireLock(lockKey, "linear-webhook", config.runner.lockTtlMinutes * 60_000)) {
    return {
      statusCode: 202,
      body: JSON.stringify({ ok: true, skipped: "active_lock" }),
    };
  }

  try {
    const routed = routePrompt(issue, config);
    const payloadToDispatch: DispatchPayload = {
      source: "linear-webhook",
      eventId: fingerprint,
      lockKey,
      branchName: `${config.github.branchPrefix}${issue.identifier.toLowerCase()}`,
      issue,
      prompt: routed.prompt,
      templateKey: routed.templateKey,
      repoOwner: config.github.owner,
      repoName: config.github.repo,
      branchPrefix: config.github.branchPrefix,
      baseBranch: config.github.baseBranch,
    };
    await triggerRepositoryDispatch(payloadToDispatch, config);
    stateStore.markProcessed(processedKey, fingerprint);
    logInfo("Linear webhook dispatched task", {
      issue: issue.identifier,
      templateKey: routed.templateKey,
    });
    return {
      statusCode: 202,
      body: JSON.stringify({ ok: true, dispatched: true }),
    };
  } finally {
    stateStore.releaseLock(lockKey);
  }
}
