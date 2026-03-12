import { logInfo, logWarn } from "../logger.js";

export interface CodexCompletionResult {
  workflowName?: string;
  runId?: number | string;
  status?: string;
  conclusion?: string | null;
  url?: string;
  branchName?: string;
  issueKey?: string;
  repository?: string;
  source?: string;
}

function resolveGatewayEndpoint(rawBaseUrl: string): string {
  const parsed = new URL(rawBaseUrl);
  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/webhooks/codex-complete";
  }
  return parsed.toString();
}

export async function onCodexComplete(
  taskId: string,
  success: boolean,
  result: CodexCompletionResult,
): Promise<void> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const token = process.env.OPENCLAW_TOKEN;

  if (!gatewayUrl || !token) {
    logWarn("Skipping Codex completion callback because OpenClaw env is missing", {
      hasGatewayUrl: Boolean(gatewayUrl),
      hasToken: Boolean(token),
      taskId,
    });
    return;
  }

  const endpoint = resolveGatewayEndpoint(gatewayUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      taskId,
      success,
      teamId: process.env.LINEAR_TEAM_ID ?? null,
      sentAt: new Date().toISOString(),
      result,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw completion callback failed: ${response.status} ${await response.text()}`);
  }

  logInfo("Posted Codex completion callback", {
    endpoint,
    taskId,
    success,
    issueKey: result.issueKey,
  });
}
