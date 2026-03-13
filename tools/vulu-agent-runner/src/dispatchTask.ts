import { resolveTaskExecutionMode } from "./config.js";
import { triggerRepositoryDispatch } from "./githubDispatch.js";
import { startLocalCodexRun } from "./localCodexExecutor.js";
import type { DispatchPayload, LocalRunHandle, RunnerConfig } from "./types.js";

export interface DispatchTaskResult {
  mode: "local" | "github";
  runHandle?: LocalRunHandle;
}

export interface LocalDispatchHooks {
  onCompleted?: (result: {
    payload: DispatchPayload;
    success: boolean;
    changed: boolean;
    commitSha?: string;
    lastMessage?: string;
    error?: string;
    worktreePath: string;
    logPath: string;
    outputPath: string;
  }) => Promise<void>;
}

export async function dispatchTask(
  payload: DispatchPayload,
  config: RunnerConfig,
  hooks?: LocalDispatchHooks,
): Promise<DispatchTaskResult> {
  const mode = resolveTaskExecutionMode(config);
  if (mode === "local") {
    const runHandle = await startLocalCodexRun(payload, config, hooks);
    return { mode, runHandle };
  }

  await triggerRepositoryDispatch(payload, config);
  return { mode };
}
