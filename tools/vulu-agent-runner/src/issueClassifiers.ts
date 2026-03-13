import type { RunnerIssue } from "./types.js";

const EXCLUDED_FOLLOW_UP_KEYWORDS = [
  "smoke test",
  "smoke-test",
  "setup",
  "runner",
  "mcp",
  "auth",
  "automation maintenance",
  "automation-maintenance",
];

function normalizeValue(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function getExcludedFollowUpKeywordHit(issue: Pick<RunnerIssue, "identifier" | "title" | "description" | "issueType" | "labels">): string | undefined {
  const haystacks = [
    issue.identifier,
    issue.title,
    issue.description ?? "",
    issue.issueType ?? "",
    ...issue.labels,
  ].map((value) => normalizeValue(value));

  for (const keyword of EXCLUDED_FOLLOW_UP_KEYWORDS) {
    const normalizedKeyword = normalizeValue(keyword);
    if (haystacks.some((value) => value.includes(normalizedKeyword))) {
      return normalizedKeyword;
    }
  }

  return undefined;
}

export function normalizeClassifierValue(value: string | undefined | null): string {
  return normalizeValue(value);
}
