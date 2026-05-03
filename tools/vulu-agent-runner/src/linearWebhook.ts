import crypto from "node:crypto";

import { maybeCreateFollowUpIssue } from "./followUpIssue.js";
import { getRequiredEnv } from "./config.js";
import { dispatchTask, type LocalDispatchHooks } from "./dispatchTask.js";
import { evaluateIssueEligibility } from "./eligibility.js";
import { getExcludedFollowUpKeywordHit, normalizeClassifierValue } from "./issueClassifiers.js";
import { logInfo, logWarn } from "./logger.js";
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
      updatedAt?: string | null;
      completedAt?: string | null;
      canceledAt?: string | null;
      priority?: number | null;
      state?: { name?: string | null } | null;
      labels?: { nodes: Array<{ name: string }> } | null;
      team?: { id?: string | null; key?: string | null } | null;
      relations?: { nodes: Array<{ type?: string | null; relatedIssue?: { identifier?: string | null } | null }> } | null;
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
      updatedAt
      completedAt
      canceledAt
      priority
      state { name }
      labels { nodes { name } }
      team { id key }
      relations(first: 20) {
        nodes {
          type
          relatedIssue { identifier }
        }
      }
    }
  }
`;

const ISSUE_LIST_QUERY = `
  query IssuesForSweep($first: Int!) {
    issues(first: $first) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        completedAt
        canceledAt
        priority
        state { name }
        labels { nodes { name } }
        team { id key }
        relations(first: 20) {
          nodes {
            type
            relatedIssue { identifier }
          }
        }
      }
    }
  }
`;

const RECENT_ISSUES_QUERY = `
  query RecentIssues($first: Int!) {
    issues(first: $first) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        completedAt
        canceledAt
        priority
        state { name }
        labels { nodes { name } }
        team { id key }
        relations(first: 20) {
          nodes {
            type
            relatedIssue { identifier }
          }
        }
      }
    }
  }
`;

interface CandidateIssue extends RunnerIssue {
  relationTypes: string[];
}

interface SelectionResult {
  issue?: CandidateIssue;
  stopReason?: string;
  inspected: number;
  skipped: Record<string, number>;
}

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
    updatedAt: graphqlIssue.updatedAt ?? undefined,
    completedAt: graphqlIssue.completedAt ?? null,
    canceledAt: graphqlIssue.canceledAt ?? null,
    priority: graphqlIssue.priority ?? undefined,
    stateName: graphqlIssue.state?.name ?? "",
    labels: graphqlIssue.labels?.nodes.map((entry) => entry.name) ?? [],
    teamId: graphqlIssue.team?.id ?? undefined,
    teamKey: graphqlIssue.team?.key ?? undefined,
  };
}

function buildCandidateIssue(
  graphqlIssue: NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]>,
): CandidateIssue {
  const issue = buildIssue(graphqlIssue);
  return {
    ...issue,
    relationTypes: graphqlIssue.relations?.nodes.map((entry) => (entry.type ?? "").toLowerCase()).filter(Boolean) ?? [],
  };
}

function getContinuationKeywordHit(issue: RunnerIssue): string | undefined {
  return getExcludedFollowUpKeywordHit(issue);
}

function priorityRank(issue: RunnerIssue): number {
  const priority = issue.priority ?? 0;
  return priority > 0 ? priority : 5;
}

function compareIssuesForContinuation(left: RunnerIssue, right: RunnerIssue): number {
  const priorityDelta = priorityRank(left) - priorityRank(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const leftUpdatedAt = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdatedAt = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return left.identifier.localeCompare(right.identifier);
}

function hasBlockingRelation(issue: CandidateIssue): boolean {
  return issue.relationTypes.some((type) => type.includes("block"));
}

function incrementCounter(counters: Record<string, number>, key: string): void {
  counters[key] = (counters[key] ?? 0) + 1;
}

async function fetchSweepIssues(first: number): Promise<CandidateIssue[]> {
  const response = await linearGraphql<{
    data?: {
      issues?: {
        nodes: Array<
          NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]>
        >;
      };
    };
  }>(ISSUE_LIST_QUERY, { first });

  return (response.data?.issues?.nodes ?? []).map((rawIssue) => buildCandidateIssue(rawIssue));
}

function selectNextEligibleIssue(
  issues: CandidateIssue[],
  config: RunnerConfig,
  stateStore: StateStore,
  options?: {
    excludeIssueId?: string;
    source?: string;
  },
): SelectionResult {
  const cooldownMs = config.runner.cooldownMinutes * 60_000;
  const expectedTeamId = process.env.LINEAR_TEAM_ID;
  const skipped: Record<string, number> = {};
  const candidates = [...issues].sort(compareIssuesForContinuation);

  for (const issue of candidates) {
    if (options?.excludeIssueId && issue.id === options.excludeIssueId) {
      incrementCounter(skipped, "current_issue");
      continue;
    }

    if (expectedTeamId && issue.teamId && issue.teamId !== expectedTeamId) {
      incrementCounter(skipped, "wrong_team");
      continue;
    }

    if (!issue.identifier.startsWith("VUL-")) {
      incrementCounter(skipped, "non_product_issue");
      continue;
    }

    if (issue.completedAt) {
      incrementCounter(skipped, "completed");
      continue;
    }

    if (issue.canceledAt) {
      incrementCounter(skipped, "canceled");
      continue;
    }

    const stateName = normalizeClassifierValue(issue.stateName);
    if (stateName === "done" || stateName === "cancelled" || stateName === "canceled") {
      incrementCounter(skipped, "terminal_state");
      continue;
    }

    if (stateName.includes("blocked")) {
      incrementCounter(skipped, "blocked_state");
      continue;
    }

    if (hasBlockingRelation(issue)) {
      incrementCounter(skipped, "blocked_relation");
      continue;
    }

    const excludedKeyword = getContinuationKeywordHit(issue);
    if (excludedKeyword) {
      incrementCounter(skipped, `excluded_keyword:${excludedKeyword}`);
      continue;
    }

    const eligibility = evaluateIssueEligibility(issue, {
      ...config.linear,
      allowedLabels: config.linear.allowedLabels.length > 0 ? config.linear.allowedLabels : issue.labels,
      allowedStates:
        config.linear.allowedStates.length > 0
          ? config.linear.allowedStates
          : issue.stateName
            ? [issue.stateName]
            : [],
    });
    if (!eligibility.eligible && eligibility.reason !== "missing_allowed_label" && eligibility.reason !== "state_not_allowed") {
      incrementCounter(skipped, eligibility.reason);
      continue;
    }

    const processedKey = `linear:${issue.id}`;
    const fingerprint = `continuation:${issue.id}:${issue.updatedAt ?? ""}`;
    if (!stateStore.shouldProcess(processedKey, fingerprint, cooldownMs)) {
      incrementCounter(skipped, "cooldown");
      continue;
    }

    const lockKey = `issue:${issue.identifier}`;
    if (!stateStore.acquireLock(lockKey, options?.source ?? "linear-continuation", config.runner.lockTtlMinutes * 60_000)) {
      incrementCounter(skipped, "active_lock");
      continue;
    }
    stateStore.releaseLock(lockKey);

    return {
      issue,
      inspected: candidates.length,
      skipped,
    };
  }

  return {
    stopReason: "no_eligible_issue",
    inspected: candidates.length,
    skipped,
  };
}

async function dispatchIssueCandidate(
  issue: CandidateIssue,
  config: RunnerConfig,
  stateStore: StateStore,
  source: DispatchPayload["source"],
  eventId: string,
  hooks?: LocalDispatchHooks,
): Promise<void> {
  const processedKey = `linear:${issue.id}`;
  const lockKey = `issue:${issue.identifier}`;
  const fingerprint = `${source}:${issue.id}:${issue.updatedAt ?? new Date().toISOString()}`;

  if (!stateStore.acquireLock(lockKey, source, config.runner.lockTtlMinutes * 60_000)) {
    throw new Error(`Unable to acquire lock for ${issue.identifier}`);
  }

  try {
    const routed = routePrompt(issue, config);
    const payload: DispatchPayload = {
      source,
      eventId,
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
    await dispatchTask(payload, config, hooks);
    stateStore.markProcessed(processedKey, fingerprint);
  } finally {
    stateStore.releaseLock(lockKey);
  }
}

export function createLinearAutoContinueHook(
  config: RunnerConfig,
  stateStore: StateStore,
): NonNullable<LocalDispatchHooks["onCompleted"]> {
  return async ({ payload, success, lastMessage }) => {
    if (!success) {
      logInfo("Auto-continue stopped because current run did not complete successfully", {
        issue: payload.issue.identifier,
        branchName: payload.branchName,
      });
      return;
    }

    if (!payload.issue.id || payload.issue.identifier === "MANUAL-TASK") {
      logInfo("Auto-continue stopped because completed run was not a Linear issue", {
        issue: payload.issue.identifier,
        branchName: payload.branchName,
      });
      return;
    }

    try {
      const followUp = await maybeCreateFollowUpIssue({
        issue: payload.issue,
        lastMessage,
        linearConfig: config.linear,
      });

      if (followUp.created) {
        logInfo("Auto-continue stopped after creating follow-up issue", {
          issue: payload.issue.identifier,
          followUpIssue: followUp.issueIdentifier,
        });
        return;
      }

      if (
        followUp.skippedReason === "existing_generated_child" ||
        followUp.skippedReason === "duplicate_child_title"
      ) {
        logInfo("Auto-continue stopped because follow-up issue already exists", {
          issue: payload.issue.identifier,
          reason: followUp.skippedReason,
        });
        return;
      }

      logInfo("No follow-up issue created from Codex output", {
        issue: payload.issue.identifier,
        reason: followUp.skippedReason,
      });
    } catch (error) {
      logWarn("Failed to evaluate Codex follow-up issue creation", {
        issue: payload.issue.identifier,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const selection = selectNextEligibleIssue(await fetchSweepIssues(250), config, stateStore, {
      excludeIssueId: payload.issue.id,
      source: "linear-auto-continue",
    });

    if (!selection.issue) {
      logInfo("Auto-continue stopped after completed Linear issue", {
        issue: payload.issue.identifier,
        stopReason: selection.stopReason,
        inspected: selection.inspected,
        skipped: selection.skipped,
      });
      return;
    }

    logInfo("Auto-continue selected next Linear issue", {
      completedIssue: payload.issue.identifier,
      nextIssue: selection.issue.identifier,
      nextPriority: selection.issue.priority ?? 0,
      nextState: selection.issue.stateName,
      skipped: selection.skipped,
    });

    await dispatchIssueCandidate(
      selection.issue,
      config,
      stateStore,
      "linear-fallback",
      `continuation:${payload.issue.id}:${selection.issue.id}:${Date.now()}`,
      { onCompleted: createLinearAutoContinueHook(config, stateStore) },
    );

    logInfo("Auto-continue dispatched next Linear issue", {
      completedIssue: payload.issue.identifier,
      nextIssue: selection.issue.identifier,
    });
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
        nodes: Array<NonNullable<NonNullable<LinearIssueResponse["data"]>["issue"]>>;
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
  return dispatchEligibleIssues(config, stateStore);
}

export async function dispatchNextEligibleIssue(
  config: RunnerConfig,
  stateStore: StateStore,
): Promise<boolean> {
  return (await dispatchEligibleIssues(config, stateStore, 1)) > 0;
}

async function dispatchEligibleIssues(
  config: RunnerConfig,
  stateStore: StateStore,
  limit = Number.POSITIVE_INFINITY,
): Promise<number> {
  const issues = await fetchSweepIssues(250);
  let dispatched = 0;

  while (dispatched < limit) {
    const selection = selectNextEligibleIssue(issues, config, stateStore, {
      source: "fallback-sweep",
    });
    if (!selection.issue) {
      logInfo("No eligible Linear issue available for dispatch", {
        source: "fallback-sweep",
        inspected: selection.inspected,
        skipped: selection.skipped,
        stopReason: selection.stopReason,
      });
      return dispatched;
    }

    await dispatchIssueCandidate(
      selection.issue,
      config,
      stateStore,
      "linear-fallback",
      `fallback:${selection.issue.id}:${selection.issue.updatedAt ?? Date.now().toString()}`,
      { onCompleted: createLinearAutoContinueHook(config, stateStore) },
    );
    dispatched += 1;

    logInfo("Dispatched next eligible Linear issue", {
      issue: selection.issue.identifier,
      priority: selection.issue.priority ?? 0,
      state: selection.issue.stateName,
      source: "fallback-sweep",
    });
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
    await dispatchTask(payloadToDispatch, config, {
      onCompleted: createLinearAutoContinueHook(config, stateStore),
    });
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
