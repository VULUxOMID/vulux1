import { getRequiredEnv } from "./config.js";
import type { DispatchPayload, RunnerConfig } from "./types.js";

export async function triggerRepositoryDispatch(
  payload: DispatchPayload,
  config: RunnerConfig,
): Promise<void> {
  const token = getRequiredEnv("GITHUB_DISPATCH_TOKEN");
  const response = await fetch(
    `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/dispatches`,
    {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: config.github.dispatchEventType,
        client_payload: {
          runner: payload,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub repository_dispatch failed: ${response.status} ${await response.text()}`);
  }
}
