import { getRequiredEnv } from "./config.js";
import { getExcludedFollowUpKeywordHit, normalizeClassifierValue } from "./issueClassifiers.js";
import { logInfo, logWarn } from "./logger.js";
import type { LinearConfig, RunnerIssue } from "./types.js";

const FOLLOW_UP_LABEL_NAMES = ["agent-ready", "codex-generated"] as const;

const FOLLOW_UP_INSTRUCTIONS = [
  "Final response contract for the local runner:",
  "- If no real remaining work exists, end with:",
  "  NO_FOLLOW_UP",
  "  Reason: <one sentence>",
  "- If real remaining product work clearly remains, end with exactly this block:",
  "  FOLLOW_UP_TITLE: <next logical task title>",
  "  FOLLOW_UP_SUMMARY:",
  "  - <remaining work bullet>",
  "  FOLLOW_UP_ACCEPTANCE:",
  "  - <acceptance criterion>",
  "- Only emit FOLLOW_UP_* when the remaining work is a real follow-up issue.",
  "- Never emit a follow-up block for smoke/setup/runner/MCP/auth/automation work.",
].join("\n");

interface IssueLabelNode {
  id: string;
  name: string;
  team?: { id?: string | null } | null;
}

interface WorkflowStateNode {
  id: string;
  name: string;
  position?: number | null;
}

interface ExistingChildIssueNode {
  id: string;
  identifier: string;
  title: string;
  labels?: { nodes: Array<{ name: string }> } | null;
}

interface FollowUpContextResponse {
  data?: {
    issues?: {
      nodes: ExistingChildIssueNode[];
    } | null;
    issueLabels?: {
      nodes: IssueLabelNode[];
    } | null;
    workflowStates?: {
      nodes: WorkflowStateNode[];
    } | null;
  };
}

interface IssueCreateResponse {
  data?: {
    issueCreate?: {
      success?: boolean | null;
      issue?: {
        id?: string | null;
        identifier?: string | null;
        title?: string | null;
        url?: string | null;
      } | null;
    } | null;
  };
}

interface IssueLabelCreateResponse {
  data?: {
    issueLabelCreate?: {
      success?: boolean | null;
      issueLabel?: IssueLabelNode | null;
    } | null;
  };
}

export interface FollowUpSuggestion {
  title: string;
  summary: string[];
  acceptanceCriteria: string[];
}

export interface FollowUpDecision {
  created: boolean;
  skippedReason?: string;
  issueIdentifier?: string;
  issueUrl?: string;
}

const FOLLOW_UP_CONTEXT_QUERY = `
  query FollowUpContext($teamId: String!, $parentId: String!) {
    issues(first: 50, filter: { parent: { id: { eq: $parentId } } }) {
      nodes {
        id
        identifier
        title
        labels { nodes { name } }
      }
    }
    issueLabels(first: 250) {
      nodes {
        id
        name
        team { id }
      }
    }
    workflowStates(
      first: 50
      filter: { team: { id: { eq: $teamId } }, type: { eq: "unstarted" } }
    ) {
      nodes {
        id
        name
        position
      }
    }
  }
`;

const ISSUE_CREATE_MUTATION = `
  mutation CreateFollowUpIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        url
      }
    }
  }
`;

const ISSUE_LABEL_CREATE_MUTATION = `
  mutation CreateIssueLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel {
        id
        name
        team { id }
      }
    }
  }
`;

function stripFormatting(value: string): string {
  return value.replace(/^[`*_~\s]+|[`*_~\s]+$/g, "").trim();
}

function extractBullets(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*]|\d+\.)\s+/.test(line))
    .map((line) => stripFormatting(line.replace(/^([-*]|\d+\.)\s+/, "")))
    .filter(Boolean);
}

function normalizeTitle(value: string): string {
  return stripFormatting(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForComparison(value: string): string {
  return normalizeTitle(value).toLowerCase();
}

function extractSection(message: string, sectionName: string, nextSectionName?: string): string | undefined {
  const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextMarker = nextSectionName
    ? `\\n${nextSectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`
    : "$";
  const pattern = new RegExp(`${escapedSectionName}:\\s*\\n([\\s\\S]*?)(?=${nextMarker})`, "i");
  const match = message.match(pattern);
  return match?.[1]?.trim();
}

export function buildFollowUpInstructions(): string {
  return FOLLOW_UP_INSTRUCTIONS;
}

export function parseFollowUpSuggestion(message: string | undefined): FollowUpSuggestion | undefined {
  if (!message) {
    return undefined;
  }

  if (/\bNO_FOLLOW_UP\b/i.test(message)) {
    return undefined;
  }

  const titleMatch = message.match(/FOLLOW_UP_TITLE:\s*(.+)/i);
  const title = normalizeTitle(titleMatch?.[1] ?? "");
  if (!title) {
    return undefined;
  }

  const summaryBlock = extractSection(message, "FOLLOW_UP_SUMMARY", "FOLLOW_UP_ACCEPTANCE");
  const acceptanceBlock = extractSection(message, "FOLLOW_UP_ACCEPTANCE");
  const summary = extractBullets(summaryBlock ?? "");
  const acceptanceCriteria = extractBullets(acceptanceBlock ?? "");

  if (summary.length === 0 || acceptanceCriteria.length === 0) {
    return undefined;
  }

  return {
    title,
    summary,
    acceptanceCriteria,
  };
}

async function linearGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = getRequiredEnv("LINEAR_API_KEY");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      authorization: token,
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

function selectQueueState(
  states: WorkflowStateNode[],
  linearConfig: LinearConfig,
): WorkflowStateNode | undefined {
  const allowedNames = linearConfig.allowedStates.length > 0 ? linearConfig.allowedStates : ["Todo"];
  for (const allowedName of allowedNames) {
    const exactMatch = states.find(
      (state) => normalizeClassifierValue(state.name) === normalizeClassifierValue(allowedName),
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  const todoState = states.find((state) => normalizeClassifierValue(state.name) === "todo");
  if (todoState) {
    return todoState;
  }

  return [...states].sort((left, right) => (left.position ?? 0) - (right.position ?? 0))[0];
}

async function createLabel(name: string, teamId: string): Promise<IssueLabelNode> {
  const response = await linearGraphql<IssueLabelCreateResponse>(ISSUE_LABEL_CREATE_MUTATION, {
    input: {
      name,
      teamId,
    },
  });

  const label = response.data?.issueLabelCreate?.issueLabel;
  if (!response.data?.issueLabelCreate?.success || !label?.id) {
    throw new Error(`Failed to create Linear label ${name}`);
  }

  return label;
}

async function resolveRequiredLabelIds(
  labels: IssueLabelNode[],
  teamId: string,
): Promise<string[]> {
  const resolvedIds: string[] = [];
  const mutableLabels = [...labels];

  for (const requiredName of FOLLOW_UP_LABEL_NAMES) {
    let label = mutableLabels.find((candidate) => {
      if (normalizeClassifierValue(candidate.name) !== normalizeClassifierValue(requiredName)) {
        return false;
      }
      const candidateTeamId = candidate.team?.id ?? null;
      return candidateTeamId === null || candidateTeamId === teamId;
    });

    if (!label) {
      label = await createLabel(requiredName, teamId);
      mutableLabels.push(label);
      logInfo("Created missing Linear label for follow-up issue", {
        label: requiredName,
        teamId,
      });
    }

    resolvedIds.push(label.id);
  }

  return resolvedIds;
}

function buildFollowUpDescription(parentIssue: RunnerIssue, suggestion: FollowUpSuggestion): string {
  const parentLink = parentIssue.url ? `[${parentIssue.identifier}](${parentIssue.url})` : parentIssue.identifier;
  const lines = [
    "Auto-created follow-up from the local Codex runner.",
    "",
    `Parent issue: ${parentLink}`,
    `Parent issue id: ${parentIssue.id}`,
    "",
    "Remaining work:",
    ...suggestion.summary.map((item) => `- ${item}`),
    "",
    "Acceptance criteria:",
    ...suggestion.acceptanceCriteria.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

function hasExistingGeneratedChild(children: ExistingChildIssueNode[]): boolean {
  return children.some((child) =>
    (child.labels?.nodes ?? []).some(
      (label) => normalizeClassifierValue(label.name) === "codex-generated",
    ),
  );
}

function hasDuplicateTitle(children: ExistingChildIssueNode[], title: string): boolean {
  const normalizedTitle = normalizeForComparison(title);
  return children.some((child) => normalizeForComparison(child.title) === normalizedTitle);
}

export async function maybeCreateFollowUpIssue(params: {
  issue: RunnerIssue;
  lastMessage?: string;
  linearConfig: LinearConfig;
}): Promise<FollowUpDecision> {
  const { issue, lastMessage, linearConfig } = params;

  if (!issue.id || !issue.teamId) {
    return {
      created: false,
      skippedReason: "missing_issue_identity",
    };
  }

  const excludedKeyword = getExcludedFollowUpKeywordHit(issue);
  if (excludedKeyword) {
    return {
      created: false,
      skippedReason: `excluded_parent_issue:${excludedKeyword}`,
    };
  }

  const suggestion = parseFollowUpSuggestion(lastMessage);
  if (!suggestion) {
    return {
      created: false,
      skippedReason: "no_explicit_follow_up_block",
    };
  }

  if (
    getExcludedFollowUpKeywordHit({
      identifier: issue.identifier,
      title: suggestion.title,
      description: suggestion.summary.join("\n"),
      labels: [],
      issueType: issue.issueType,
    })
  ) {
    return {
      created: false,
      skippedReason: "excluded_follow_up_scope",
    };
  }

  const context = await linearGraphql<FollowUpContextResponse>(FOLLOW_UP_CONTEXT_QUERY, {
    teamId: issue.teamId,
    parentId: issue.id,
  });

  const existingChildren = context.data?.issues?.nodes ?? [];
  if (hasExistingGeneratedChild(existingChildren)) {
    return {
      created: false,
      skippedReason: "existing_generated_child",
    };
  }

  if (hasDuplicateTitle(existingChildren, suggestion.title)) {
    return {
      created: false,
      skippedReason: "duplicate_child_title",
    };
  }

  const workflowStates = context.data?.workflowStates?.nodes ?? [];
  const state = selectQueueState(workflowStates, linearConfig);
  if (!state) {
    return {
      created: false,
      skippedReason: "missing_queue_state",
    };
  }

  let labelIds: string[];
  try {
    labelIds = await resolveRequiredLabelIds(context.data?.issueLabels?.nodes ?? [], issue.teamId);
  } catch (error) {
    logWarn("Failed to resolve follow-up labels", {
      issue: issue.identifier,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      created: false,
      skippedReason: "label_resolution_failed",
    };
  }

  const response = await linearGraphql<IssueCreateResponse>(ISSUE_CREATE_MUTATION, {
    input: {
      teamId: issue.teamId,
      parentId: issue.id,
      title: suggestion.title,
      description: buildFollowUpDescription(issue, suggestion),
      labelIds,
      stateId: state.id,
      ...(typeof issue.priority === "number" ? { priority: issue.priority } : {}),
    },
  });

  const createdIssue = response.data?.issueCreate?.issue;
  if (!response.data?.issueCreate?.success || !createdIssue?.id || !createdIssue.identifier) {
    return {
      created: false,
      skippedReason: "issue_create_failed",
    };
  }

  logInfo("Created Linear follow-up issue from Codex output", {
    parentIssue: issue.identifier,
    followUpIssue: createdIssue.identifier,
    title: createdIssue.title ?? suggestion.title,
  });

  return {
    created: true,
    issueIdentifier: createdIssue.identifier,
    issueUrl: createdIssue.url ?? undefined,
  };
}
