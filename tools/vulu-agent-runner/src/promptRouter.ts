import { buildFollowUpInstructions } from "./followUpIssue.js";
import type { PromptRoute, RunnerConfig, RunnerIssue } from "./types.js";

function matchesRoute(route: PromptRoute, issue: RunnerIssue): boolean {
  if (route.matchLabels?.length) {
    const issueLabels = issue.labels.map((label) => label.toLowerCase());
    const routeLabels = route.matchLabels.map((label) => label.toLowerCase());
    if (!routeLabels.some((label) => issueLabels.includes(label))) {
      return false;
    }
  }

  if (route.matchIssueTypes?.length) {
    const issueType = issue.issueType?.toLowerCase() ?? "";
    if (!route.matchIssueTypes.map((value) => value.toLowerCase()).includes(issueType)) {
      return false;
    }
  }

  if (route.matchStates?.length) {
    const stateName = issue.stateName?.toLowerCase() ?? "";
    if (!route.matchStates.map((value) => value.toLowerCase()).includes(stateName)) {
      return false;
    }
  }

  return true;
}

function renderTemplate(template: string, issue: RunnerIssue): string {
  return template
    .replaceAll("{{issue.identifier}}", issue.identifier)
    .replaceAll("{{issue.title}}", issue.title)
    .replaceAll("{{issue.description}}", issue.description ?? "")
    .replaceAll("{{issue.url}}", issue.url ?? "")
    .replaceAll("{{issue.stateName}}", issue.stateName ?? "")
    .replaceAll("{{issue.issueType}}", issue.issueType ?? "");
}

export function routePrompt(issue: RunnerIssue, config: RunnerConfig): {
  templateKey: string;
  prompt: string;
} {
  const selectedRoute = config.routes.find((route) => matchesRoute(route, issue));
  const templateKey = selectedRoute?.templateKey ?? "default";
  const template = config.promptTemplates[templateKey] ?? config.promptTemplates.default;
  const rendered = renderTemplate(template, issue).trim();
  return {
    templateKey,
    prompt: `${rendered}\n\n${buildFollowUpInstructions()}`,
  };
}
