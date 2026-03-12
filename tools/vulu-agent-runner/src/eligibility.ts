import type { EligibilityResult, LinearConfig, RunnerIssue } from "./types.js";

function normalize(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase());
}

export function evaluateIssueEligibility(issue: RunnerIssue, config: LinearConfig): EligibilityResult {
  const labels = normalize(issue.labels);
  const allowedLabels = normalize(config.allowedLabels);
  const blockedLabels = normalize(config.blockedLabels);
  const allowedStates = normalize(config.allowedStates);
  const safeIssueTypes = normalize(config.safeIssueTypes);

  if (!labels.some((label) => allowedLabels.includes(label))) {
    return {
      eligible: false,
      reason: "missing_allowed_label",
    };
  }

  if (labels.some((label) => blockedLabels.includes(label))) {
    return {
      eligible: false,
      reason: "blocked_label_present",
    };
  }

  if (issue.stateName && !allowedStates.includes(issue.stateName.toLowerCase())) {
    return {
      eligible: false,
      reason: "state_not_allowed",
    };
  }

  if (issue.issueType && !safeIssueTypes.includes(issue.issueType.toLowerCase())) {
    return {
      eligible: false,
      reason: "issue_type_not_safe",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
  };
}
