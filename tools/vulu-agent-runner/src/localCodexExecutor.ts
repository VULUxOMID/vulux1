import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveRunnerRepoPath, resolveRunsDir } from "./config.js";
import type { LocalDispatchHooks } from "./dispatchTask.js";
import { logError, logInfo, logWarn } from "./logger.js";
import type { DispatchPayload, LocalRunHandle, LocalRunRecord, RunnerConfig } from "./types.js";
import { onCodexComplete } from "./vulu-integration/runner-webhook.js";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface GitWorktreeRecord {
  path: string;
  branch?: string;
}

const DEFAULT_CODEX_ENV_PATH = process.env.HOME
  ? path.join(process.env.HOME, ".codex", "environments", "environment.toml")
  : undefined;

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; input?: string },
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

async function listGitWorktrees(cwd: string): Promise<GitWorktreeRecord[]> {
  const result = await runCommand("git", ["worktree", "list", "--porcelain"], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect git worktrees: ${result.stderr || result.stdout}`);
  }

  const records: GitWorktreeRecord[] = [];
  let current: GitWorktreeRecord | null = null;

  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (current?.path) {
        records.push(current);
      }
      current = null;
      continue;
    }

    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
      continue;
    }

    if (line.startsWith("branch ")) {
      current ??= { path: "" };
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }

  if (current?.path) {
    records.push(current);
  }

  return records;
}

function parseTomlEnvFile(filePath: string): Record<string, string> {
  const raw = fs.readFileSync(filePath, "utf8");
  const env: Record<string, string> = {};
  let inEnvSection = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      inEnvSection = sectionMatch[1] === "env";
      continue;
    }

    if (!inEnvSection) {
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    let value = rawValue.trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function resolveCodexExecEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const envFilePath = process.env.VULU_AGENT_CODEX_ENV_FILE ?? DEFAULT_CODEX_ENV_PATH;
  if (!envFilePath || !fs.existsSync(envFilePath)) {
    return baseEnv;
  }

  try {
    const codexEnv = parseTomlEnvFile(envFilePath);
    const loadedKeys = Object.keys(codexEnv).filter((key) => !baseEnv[key]);
    if (loadedKeys.length === 0) {
      return baseEnv;
    }

    const childEnv: NodeJS.ProcessEnv = { ...baseEnv };
    for (const key of loadedKeys) {
      childEnv[key] = codexEnv[key];
    }

    logInfo("Loaded Codex environment for local Codex run", {
      envFilePath,
      loadedKeys,
    });

    return childEnv;
  } catch (error) {
    logWarn("Failed to load Codex environment for local Codex run", {
      envFilePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return baseEnv;
  }
}

function createRunPaths(payload: DispatchPayload, config: RunnerConfig) {
  const runsDir = resolveRunsDir(config);
  const runDir = path.join(runsDir, sanitizePathSegment(payload.eventId));
  const promptPath = path.join(runDir, "prompt.md");
  const outputPath = path.join(runDir, "codex-last-message.txt");
  const logPath = path.join(runDir, "codex.log");
  const metadataPath = path.join(runDir, "run.json");
  const worktreePath = path.join(runDir, "worktree");
  return { runsDir, runDir, promptPath, outputPath, logPath, metadataPath, worktreePath };
}

function readRunRecord(metadataPath: string): LocalRunRecord | null {
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as LocalRunRecord;
}

function writeRunRecord(metadataPath: string, record: LocalRunRecord): void {
  fs.writeFileSync(metadataPath, JSON.stringify(record, null, 2), "utf8");
}

function patchRunRecord(metadataPath: string, patch: Partial<LocalRunRecord>): void {
  const current = readRunRecord(metadataPath);
  if (!current) {
    return;
  }
  writeRunRecord(metadataPath, { ...current, ...patch });
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupStaleBranchWorktrees(
  payload: DispatchPayload,
  config: RunnerConfig,
  targetWorktreePath: string,
): Promise<void> {
  const repoRoot = resolveRunnerRepoPath(config);
  const runsDir = resolveRunsDir(config);
  const liveBranchOwnerPaths = new Set<string>();

  if (fs.existsSync(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const metadataPath = path.join(runsDir, entry.name, "run.json");
      const record = readRunRecord(metadataPath);
      if (!record || record.branchName !== payload.branchName || !record.worktreePath) {
        continue;
      }

      if (record.status === "running" && typeof record.pid === "number" && isPidRunning(record.pid)) {
        liveBranchOwnerPaths.add(record.worktreePath);
        continue;
      }

      patchRunRecord(metadataPath, {
        status: "orphaned",
        completedAt: record.completedAt ?? new Date().toISOString(),
        error: record.error ?? "Recovered stale branch worktree before retry.",
      });
    }
  }

  const worktrees = await listGitWorktrees(repoRoot);
  for (const worktree of worktrees) {
    if (worktree.path === targetWorktreePath || worktree.branch !== payload.branchName) {
      continue;
    }
    if (liveBranchOwnerPaths.has(worktree.path)) {
      throw new Error(`Branch ${payload.branchName} is still active in ${worktree.path}`);
    }

    const removeResult = await runCommand("git", ["worktree", "remove", "--force", worktree.path], {
      cwd: repoRoot,
    });
    if (removeResult.exitCode !== 0) {
      throw new Error(`Failed to recover stale worktree ${worktree.path}: ${removeResult.stderr || removeResult.stdout}`);
    }
  }
}

async function prepareWorktree(
  payload: DispatchPayload,
  config: RunnerConfig,
  worktreePath: string,
): Promise<string> {
  const repoRoot = resolveRunnerRepoPath(config);
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  if (fs.existsSync(worktreePath)) {
    await runCommand("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
  }

  await cleanupStaleBranchWorktrees(payload, config, worktreePath);

  const result = await runCommand(
    "git",
    ["worktree", "add", "-B", payload.branchName, worktreePath, payload.baseBranch],
    { cwd: repoRoot },
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${result.stderr || result.stdout}`);
  }

  await runCommand("git", ["config", "user.name", "vulu-agent-runner"], { cwd: worktreePath });
  await runCommand("git", ["config", "user.email", "runner@vulu.local"], { cwd: worktreePath });

  return worktreePath;
}

async function hasChanges(cwd: string): Promise<boolean> {
  const result = await runCommand("git", ["status", "--porcelain"], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect git status: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim().length > 0;
}

async function commitChanges(payload: DispatchPayload, cwd: string): Promise<string | undefined> {
  const dirty = await hasChanges(cwd);
  if (!dirty) {
    return undefined;
  }

  const addResult = await runCommand("git", ["add", "-A"], { cwd });
  if (addResult.exitCode !== 0) {
    throw new Error(`git add failed: ${addResult.stderr || addResult.stdout}`);
  }

  const commitResult = await runCommand(
    "git",
    ["commit", "-m", `codex: ${payload.issue.identifier} local runner update`],
    { cwd },
  );
  if (commitResult.exitCode !== 0) {
    throw new Error(`git commit failed: ${commitResult.stderr || commitResult.stdout}`);
  }

  const revParse = await runCommand("git", ["rev-parse", "HEAD"], { cwd });
  if (revParse.exitCode !== 0) {
    throw new Error(`git rev-parse failed: ${revParse.stderr || revParse.stdout}`);
  }
  return revParse.stdout.trim();
}

async function finalizeLocalRun(
  child: ReturnType<typeof spawn>,
  payload: DispatchPayload,
  handle: LocalRunHandle,
  worktreePath: string,
  metadataPath: string,
  hooks?: LocalDispatchHooks,
): Promise<void> {
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const logStream = fs.createWriteStream(handle.logPath, { flags: "a" });
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    stdoutBuffer += text;
    logStream.write(text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    stderrBuffer += text;
    logStream.write(text);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  logStream.end();

  let changed = false;
  let commitSha: string | undefined;
  let lastMessage: string | undefined;
  let completionError: string | undefined;

  try {
    if (fs.existsSync(handle.outputPath)) {
      lastMessage = fs.readFileSync(handle.outputPath, "utf8").trim() || undefined;
    }
    changed = await hasChanges(worktreePath);
    if (exitCode === 0) {
      commitSha = await commitChanges(payload, worktreePath);
      changed = Boolean(commitSha);
    }
  } catch (error) {
    completionError = error instanceof Error ? error.message : String(error);
    logWarn("Failed to finalize local Codex run cleanly", {
      taskId: handle.taskId,
      branchName: handle.branchName,
      error: completionError,
    });
  }

  const success = exitCode === 0 && !completionError;
  logInfo("Finished local Codex run", {
    taskId: handle.taskId,
    success,
    branchName: handle.branchName,
    changed,
    commitSha,
  });

  patchRunRecord(metadataPath, {
    status: success ? "completed" : "failed",
    completedAt: new Date().toISOString(),
    changed,
    commitSha,
    lastMessage,
    exitCode,
    error:
      completionError ??
      (exitCode === 0 ? undefined : stderrBuffer || stdoutBuffer || `Codex exited with ${exitCode}`),
  });

  try {
    await onCodexComplete(handle.taskId, success, {
      workflowName: "local-codex",
      runId: handle.taskId,
      status: success ? "completed" : "failed",
      conclusion: success ? "success" : "failure",
      branchName: handle.branchName,
      issueKey: payload.issue.identifier,
      repository: `${payload.repoOwner}/${payload.repoName}`,
      source: "local-runner",
      changed,
      commitSha,
      worktreePath,
      logPath: handle.logPath,
      outputPath: handle.outputPath,
      lastMessage,
      error: completionError ?? (exitCode === 0 ? undefined : stderrBuffer || stdoutBuffer || `Codex exited with ${exitCode}`),
    });
  } catch (callbackError) {
    logWarn("OpenClaw completion callback failed for local Codex run", {
      taskId: handle.taskId,
      branchName: handle.branchName,
      error: callbackError instanceof Error ? callbackError.message : String(callbackError),
    });
  }

  if (hooks?.onCompleted) {
    try {
      await hooks.onCompleted({
        payload,
        success,
        changed,
        commitSha,
        lastMessage,
        error:
          completionError ??
          (exitCode === 0 ? undefined : stderrBuffer || stdoutBuffer || `Codex exited with ${exitCode}`),
        worktreePath,
        logPath: handle.logPath,
        outputPath: handle.outputPath,
      });
    } catch (continuationError) {
      logWarn("Post-run continuation hook failed", {
        taskId: handle.taskId,
        branchName: handle.branchName,
        error: continuationError instanceof Error ? continuationError.message : String(continuationError),
      });
    }
  }
}

export async function startLocalCodexRun(
  payload: DispatchPayload,
  config: RunnerConfig,
  hooks?: LocalDispatchHooks,
): Promise<LocalRunHandle> {
  const repoRoot = resolveRunnerRepoPath(config);
  const { runDir, promptPath, outputPath, logPath, metadataPath, worktreePath } = createRunPaths(payload, config);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(promptPath, payload.prompt, "utf8");
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      <LocalRunRecord>{
        eventId: payload.eventId,
        issue: payload.issue,
        branchName: payload.branchName,
        repoRoot,
        createdAt: new Date().toISOString(),
        mode: "local",
        status: "running",
      },
      null,
      2,
    ),
    "utf8",
  );

  let preparedWorktree: string;
  try {
    preparedWorktree = await prepareWorktree(payload, config, worktreePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    patchRunRecord(metadataPath, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: message,
      worktreePath,
      logPath,
      outputPath,
    });
    throw error;
  }

  const codexExecEnv = resolveCodexExecEnv(process.env);
  const child = spawn(
    "codex",
    [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C",
      preparedWorktree,
      "-o",
      outputPath,
      "-",
    ],
    {
      cwd: preparedWorktree,
      env: codexExecEnv,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  child.stdin.write(payload.prompt);
  child.stdin.end();

  const handle: LocalRunHandle = {
    mode: "local",
    taskId: payload.eventId,
    branchName: payload.branchName,
    worktreePath: preparedWorktree,
    promptPath,
    logPath,
    outputPath,
    pid: child.pid,
  };

  patchRunRecord(metadataPath, {
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    worktreePath: preparedWorktree,
    logPath,
    outputPath,
  });

  logInfo("Started local Codex run", {
    taskId: handle.taskId,
    pid: handle.pid,
    branchName: handle.branchName,
    worktreePath: handle.worktreePath,
  });

  void finalizeLocalRun(child, payload, handle, preparedWorktree, metadataPath, hooks).catch((error) => {
    logError("Local Codex run crashed", {
      taskId: handle.taskId,
      branchName: handle.branchName,
      error: error instanceof Error ? error.message : String(error),
    });
    patchRunRecord(metadataPath, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return handle;
}

export function countActiveLocalRuns(config: RunnerConfig): number {
  const runsDir = resolveRunsDir(config);
  if (!fs.existsSync(runsDir)) {
    return 0;
  }

  let active = 0;
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const metadataPath = path.join(runsDir, entry.name, "run.json");
    const record = readRunRecord(metadataPath);
    if (!record || record.status !== "running" || typeof record.pid !== "number") {
      continue;
    }

    if (isPidRunning(record.pid)) {
      active += 1;
      continue;
    }

    patchRunRecord(metadataPath, {
      status: "orphaned",
      completedAt: new Date().toISOString(),
      error: record.error ?? "Tracked Codex process is no longer running.",
    });
  }

  return active;
}
