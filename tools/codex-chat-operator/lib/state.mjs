import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);
const DEFAULT_STATE = {
  version: 1,
  tasks: [],
  runs: [],
};

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cloneDefaultState() {
  return {
    version: DEFAULT_STATE.version,
    tasks: [],
    runs: [],
  };
}

export function resolveDataPaths(rootDir) {
  const dataDir =
    process.env.CODEX_OPERATOR_DATA_DIR || path.join(rootDir, "tools", "codex-chat-operator", ".data");
  return {
    dataDir,
    statePath: path.join(dataDir, "state.json"),
    runsDir: path.join(dataDir, "runs"),
  };
}

export function readState(statePath) {
  if (!fs.existsSync(statePath)) {
    return cloneDefaultState();
  }

  const raw = fs.readFileSync(statePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    version: Number.isFinite(parsed?.version) ? parsed.version : 1,
    tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    runs: Array.isArray(parsed?.runs) ? parsed.runs : [],
  };
}

export function writeState(statePath, nextState) {
  ensureDir(path.dirname(statePath));
  const tempPath = `${statePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(nextState, null, 2), "utf8");
  fs.renameSync(tempPath, statePath);
}

export function createRunId(taskId) {
  const slug = String(taskId || "task")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${slug || "task"}-${Date.now()}-${suffix}`;
}

export function upsertTask(state, input) {
  const timestamp = nowIso();
  const existingIndex = state.tasks.findIndex((task) => task.taskId === input.taskId);
  const existing = existingIndex >= 0 ? state.tasks[existingIndex] : null;
  const nextTask = {
    taskId: input.taskId,
    title: input.title,
    branch: input.branch,
    baseCommit: input.baseCommit,
    body: input.body,
    expectedFiles: input.expectedFiles,
    source: input.source || existing?.source || null,
    ticketUrl: input.ticketUrl || existing?.ticketUrl || null,
    chatUrl: existing?.chatUrl || null,
    status: existing?.status && ACTIVE_RUN_STATUSES.has(existing.status) ? existing.status : "pending",
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastRunId: existing?.lastRunId || null,
    cooldownUntil: input.cooldownUntil || existing?.cooldownUntil || null,
  };

  if (existingIndex >= 0) {
    state.tasks[existingIndex] = nextTask;
  } else {
    state.tasks.push(nextTask);
  }

  return nextTask;
}

export function findTask(state, taskId) {
  return state.tasks.find((task) => task.taskId === taskId) || null;
}

export function findRun(state, runId) {
  return state.runs.find((run) => run.runId === runId) || null;
}

export function findConflictingRun(state, task) {
  return (
    state.runs.find((run) => {
      if (!ACTIVE_RUN_STATUSES.has(run.status)) {
        return false;
      }
      return run.taskId === task.taskId || run.branch === task.branch;
    }) || null
  );
}

export function listActiveRuns(state) {
  return state.runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status));
}

export function findOldestActiveRun(state) {
  const activeRuns = listActiveRuns(state);
  if (activeRuns.length === 0) {
    return null;
  }

  return [...activeRuns].sort((left, right) => {
    const leftTs = Date.parse(left.startedAt || left.createdAt || "");
    const rightTs = Date.parse(right.startedAt || right.createdAt || "");
    return leftTs - rightTs;
  })[0];
}

export function listPendingTasks(state) {
  const now = Date.now();
  return [...state.tasks]
    .filter((task) => task.status === "pending")
    .filter((task) => !task.cooldownUntil || Date.parse(task.cooldownUntil) <= now)
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
}

export function createRunRecord(task, promptPath, targetUrl) {
  const timestamp = nowIso();
  return {
    runId: createRunId(task.taskId),
    taskId: task.taskId,
    branch: task.branch,
    baseCommit: task.baseCommit,
    status: "queued",
    targetUrl,
    chatUrl: task.chatUrl || null,
    promptPath,
    createdAt: timestamp,
    startedAt: null,
    completedAt: null,
    error: null,
  };
}

export function addRun(state, run) {
  state.runs.push(run);
  const task = findTask(state, run.taskId);
  if (task) {
    task.status = run.status;
    task.lastRunId = run.runId;
    task.updatedAt = nowIso();
  }
}

export function updateRun(state, runId, patch) {
  const run = findRun(state, runId);
  if (!run) {
    throw new Error(`Unknown run: ${runId}`);
  }

  Object.assign(run, patch);
  if (patch.status && ["done", "failed", "blocked", "cancelled"].includes(patch.status)) {
    run.completedAt = patch.completedAt || nowIso();
  }

  const task = findTask(state, run.taskId);
  if (task) {
    task.status =
      patch.status === "done"
        ? "done"
        : patch.status === "blocked"
          ? "blocked"
          : patch.status === "cancelled"
            ? "cancelled"
            : patch.status === "failed"
              ? "pending"
              : run.status;
    task.updatedAt = nowIso();
    if (patch.chatUrl) {
      task.chatUrl = patch.chatUrl;
    }
  }

  return run;
}

export function writePromptFile(runsDir, runId, prompt) {
  const runDir = path.join(runsDir, runId);
  ensureDir(runDir);
  const promptPath = path.join(runDir, "prompt.md");
  fs.writeFileSync(promptPath, prompt, "utf8");
  return promptPath;
}

export function recoverStaleRuns(state, staleAfterMinutes) {
  const cutoffMs = Date.now() - staleAfterMinutes * 60_000;
  const recovered = [];
  for (const run of state.runs) {
    if (!ACTIVE_RUN_STATUSES.has(run.status)) continue;
    const startRef = run.startedAt || run.createdAt;
    if (!startRef || Date.parse(startRef) > cutoffMs) continue;
    Object.assign(run, {
      status: 'failed',
      error: 'Auto-recovered: stale after ' + staleAfterMinutes + 'min.',
      completedAt: new Date().toISOString(),
    });
    const task = findTask(state, run.taskId);
    if (task) { task.status = 'pending'; task.updatedAt = new Date().toISOString(); }
    recovered.push(run.runId);
  }
  return recovered;
}
