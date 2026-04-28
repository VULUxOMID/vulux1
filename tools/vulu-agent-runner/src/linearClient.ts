import type { RunnerConfig } from "./config.js";
import type { LinearIssueSummary } from "./types.js";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toLabelNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString((entry as { name?: unknown }).name ?? entry))
      .filter(Boolean);
  }

  const nodes = (value as { nodes?: unknown[] } | null)?.nodes;
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((entry) => normalizeString((entry as { name?: unknown }).name))
    .filter(Boolean);
}

function toIssueSummary(value: unknown): LinearIssueSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const issue = value as Record<string, unknown>;
  const id = normalizeString(issue.id);
  const identifier = normalizeString(issue.identifier);
  const title = normalizeString(issue.title);
  if (!id || !identifier || !title) {
    return null;
  }

  const stateRecord =
    issue.state && typeof issue.state === "object" ? (issue.state as Record<string, unknown>) : {};
  const teamRecord =
    issue.team && typeof issue.team === "object" ? (issue.team as Record<string, unknown>) : {};

  return {
    id,
    identifier,
    title,
    description: normalizeString(issue.description),
    url: normalizeString(issue.url),
    updatedAt: normalizeString(issue.updatedAt),
    stateName: normalizeString(stateRecord.name),
    stateType: normalizeString(stateRecord.type) || null,
    labelNames: toLabelNames(issue.labels),
    teamKey: normalizeString(teamRecord.key) || null,
    teamName: normalizeString(teamRecord.name) || null
  };
}

async function graphqlRequest<TData>(
  config: RunnerConfig,
  query: string,
  variables: Record<string, unknown>
): Promise<TData> {
  if (!config.linearApiKey) {
    throw new Error("Linear API key is not configured.");
  }

  const response = await fetch(config.linearApiUrl, {
    method: "POST",
    headers: {
      Authorization: config.linearApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  const payload = (await response.json().catch(() => null)) as GraphqlEnvelope<TData> | null;
  if (!response.ok) {
    throw new Error(`Linear GraphQL request failed with ${response.status}`);
  }
  if (!payload) {
    throw new Error("Linear GraphQL response was empty.");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message ?? "Unknown Linear error").join("; "));
  }
  if (!payload.data) {
    throw new Error("Linear GraphQL response did not include data.");
  }

  return payload.data;
}

export async function fetchIssueById(
  config: RunnerConfig,
  issueId: string
): Promise<LinearIssueSummary | null> {
  const data = await graphqlRequest<{ issue: unknown | null }>(
    config,
    `
      query AgentIssue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          description
          url
          updatedAt
          state {
            name
            type
          }
          labels {
            nodes {
              name
            }
          }
          team {
            key
            name
          }
        }
      }
    `,
    { issueId }
  );

  return toIssueSummary(data.issue);
}

export async function fetchRecentIssues(config: RunnerConfig): Promise<LinearIssueSummary[]> {
  const issues: LinearIssueSummary[] = [];
  let after: string | null = null;

  type RecentIssuesQuery = {
    issues: {
      nodes: unknown[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };

  while (issues.length < config.sweepMaxIssues) {
    const data: RecentIssuesQuery = await graphqlRequest<RecentIssuesQuery>(
      config,
      `
        query AgentIssues($first: Int!, $after: String) {
          issues(first: $first, after: $after, orderBy: updatedAt) {
            nodes {
              id
              identifier
              title
              description
              url
              updatedAt
              state {
                name
                type
              }
              labels {
                nodes {
                  name
                }
              }
              team {
                key
                name
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        first: Math.min(config.sweepPageSize, config.sweepMaxIssues - issues.length),
        after
      }
    );

    for (const issue of data.issues.nodes) {
      const parsed = toIssueSummary(issue);
      if (parsed) {
        issues.push(parsed);
      }
    }

    if (!data.issues.pageInfo.hasNextPage || !data.issues.pageInfo.endCursor) {
      break;
    }
    after = data.issues.pageInfo.endCursor;
  }

  return issues;
}

export async function createIssueComment(
  config: RunnerConfig,
  issueId: string,
  body: string
): Promise<void> {
  await graphqlRequest(
    config,
    `
      mutation AgentCommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
        }
      }
    `,
    {
      input: {
        issueId,
        body
      }
    }
  );
}
