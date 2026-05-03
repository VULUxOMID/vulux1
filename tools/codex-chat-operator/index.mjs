#!/usr/bin/env node
import { spawnSync as _spawnSyncVerify } from "node:child_process";
function verifyShipped(branch, taskId, probeHasViewPR, repoRoot) {
  // Primary signal: Codex UI shows "View PR" button → PR is live on GitHub
  if (probeHasViewPR) return { verified: true, reason: "Codex shows View PR button" };
  const root = repoRoot || "/Users/omid/vulux1";
  // Exact branch name
  const ls = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin", branch], { cwd: root, encoding: "utf8" });
  if (ls.stdout && ls.stdout.trim().length > 0) return { verified: true, reason: "remote branch: " + branch };
  // Partial match by ticket ID (Codex may push under a different prefix)
  if (taskId) {
    const allLs = _spawnSyncVerify("git", ["ls-remote", "--heads", "origin"], { cwd: root, encoding: "utf8" });
    // Normalize: "VUL-158" -> "vul-158", search only in the ref name (last token), not the SHA
    const ticketLower = taskId.toLowerCase();
    const lines = (allLs.stdout || "").split("\n");
    const match = lines.find((l) => {
      const tokens = l.trim().split(/\s+/);
      const refName = (tokens[1] || tokens[0] || "").toLowerCase();
      return refName.includes(ticketLower);
    });
    if (match && match.trim()) return { verified: true, reason: "partial-match branch: " + match.trim() };
  }
  return { verified: false, reason: "no remote branch for: " + branch + (taskId ? " (" + taskId + ")" : "") };
}


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clickCreatePRButton, getLatestTaskUrl, inspectCodexRun, sendPromptToCodex } from "./lib/chromeTransport.mjs";
import { buildPrompt } from "./lib/prompt.mjs";
import {
  addRun,
  recoverStaleRuns,
  createRunRecord,
  findConflictingRun,
  findOldestActiveRun,
  findRun,
  findTask,
  listPendingTasks,
  readState,
  resolveDataPaths,
  updateRun,
  upsertTask,
  writePromptFile,
  writeState,
} from "./lib/state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const { statePath, runsDir } = resolveDataPaths(repoRoot);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

function requireFlag(flags, key) {
  const value = flags[key];
  if (!value || value === true) {
    fail(`Missing required flag --${key}`);
  }
  return String(value);
}

function readBody(flags) {
  if (flags["body-file"]) {
    return fs.readFileSync(path.resolve(process.cwd(), String(flags["body-file"])), "utf8");
  }
  if (flags.body && flags.body !== true) {
    return String(flags.body);
  }
  fail("Provide --body or --body-file");
}

function parseExpectedFiles(value) {
  if (!value || value === true) {
    return [];
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function printUsage() {
  console.log(`
Usage:
  node tools/codex-chat-operator/index.mjs enqueue-task --task-id VUL-170 --title "Auth migration" --branch codex/vul-170 --base-commit abc123 --body-file ./prompt.md [--expected-files file1,file2]
  node tools/codex-chat-operator/index.mjs dispatch-next [--task-id VUL-170] [--dry-run]
  node tools/codex-chat-operator/index.mjs probe-active-run
  node tools/codex-chat-operator/index.mjs complete-run --run-id <run-id> --status done|blocked|failed|cancelled [--chat-url <url>] [--error <message>]
  node tools/codex-chat-operator/index.mjs list
`);
}

function loadState() {
  return readState(statePath);
}

function saveState(state) {
  writeState(statePath, state);
}

function commandEnqueue(flags) {
  const state = loadState();
  const taskId = requireFlag(flags, "task-id");
  const existing = findTask(state, taskId);

  if (!flags.force && existing) {
    const activeConflict = findConflictingRun(state, existing);
    if (activeConflict) {
      fail(
        `Task ${taskId} already has active run ${activeConflict.runId} on branch ${activeConflict.branch}. Use --force to overwrite task metadata only.`,
      );
    }
  }

  const task = upsertTask(state, {
    taskId,
    title: requireFlag(flags, "title"),
    branch: requireFlag(flags, "branch"),
    baseCommit: requireFlag(flags, "base-commit"),
    body: readBody(flags),
    expectedFiles: parseExpectedFiles(flags["expected-files"]),
    ticketUrl: flags["ticket-url"] && flags["ticket-url"] !== true ? String(flags["ticket-url"]) : null,
    source: flags.source && flags.source !== true ? String(flags.source) : null,
    cooldownUntil:
      flags["cooldown-minutes"] && flags["cooldown-minutes"] !== true
        ? new Date(Date.now() + Number(flags["cooldown-minutes"]) * 60_000).toISOString()
        : null,
  });

  saveState(state);
  console.log(`Queued ${task.taskId} on ${task.branch}`);
}

function selectTask(state, flags) {
  if (flags["task-id"] && flags["task-id"] !== true) {
    const task = findTask(state, String(flags["task-id"]));
    if (!task) {
      fail(`Unknown task ${flags["task-id"]}`);
    }
    if (task.status !== "pending") {
      fail(`Task ${task.taskId} is not pending. Current status: ${task.status}`);
    }
    return task;
  }

  const pending = listPendingTasks(state);
  if (pending.length === 0) {
    return null;
  }
  return pending[0];
}

function reconcileActiveRun(state, flags) {
  const activeRun = findOldestActiveRun(state);
  if (!activeRun) {
    return null;
  }

  const stableIdlePolls =
    flags["stable-idle-polls"] && flags["stable-idle-polls"] !== true
      ? Number(flags["stable-idle-polls"])
      : 2;
  const probeTarget = activeRun.chatUrl || activeRun.targetUrl || "https://chatgpt.com/codex";
  const inspected = inspectCodexRun(probeTarget);
  const previousProbe = activeRun.probe && typeof activeRun.probe === "object" ? activeRun.probe : null;
  const idlePolls =
    inspected.status === "idle"
      ? (previousProbe?.status === "idle" ? Number(previousProbe.idlePolls || 0) : 0) + 1
      : 0;

  updateRun(state, activeRun.runId, {
    chatUrl: (inspected.href && inspected.href.includes("/tasks/"))
      ? inspected.href
      : (inspected.latestTaskUrl && inspected.latestTaskUrl.includes("/tasks/"))
        ? inspected.latestTaskUrl
        : (inspected.href || activeRun.chatUrl),
    probe: {
      status: inspected.status,
      idlePolls,
      checkedAt: new Date().toISOString(),
      activeMarkers: inspected.activeMarkers,
      stopLikeButtons: inspected.stopLikeButtons,
      bodySample: inspected.bodySample,
    },
  });

  if (inspected.status === "idle" && idlePolls >= stableIdlePolls) {
    const branch = activeRun.branch || "";
    const bodyText = inspected.bodySample || "";
    // If Codex finished but hasn't pushed yet — auto-click "Create PR"
    if (inspected.hasCreatePR) {
      const taskPageUrl = (inspected.href && inspected.href.includes("/tasks/")) ? inspected.href : (activeRun.chatUrl || activeRun.targetUrl);
      const clickResult = clickCreatePRButton(taskPageUrl);
      updateRun(state, activeRun.runId, {
        probe: { status: "creating-pr", clickResult, checkedAt: new Date().toISOString() },
      });
      return { runId: activeRun.runId, status: "creating-pr", reason: clickResult, inspected, idlePolls };
    }

    if (/NO-SHIP:/i.test(bodyText)) {
      updateRun(state, activeRun.runId, { status: "done", error: "NO-SHIP declared by Codex.", chatUrl: inspected.href || activeRun.chatUrl });
      return { runId: activeRun.runId, status: "done", reason: "NO-SHIP", inspected, idlePolls };
    }
    if (branch) {
      const ship = verifyShipped(branch, activeRun.taskId, inspected.hasViewPR);
      if (ship.verified) {
        updateRun(state, activeRun.runId, { status: "done", error: null, chatUrl: inspected.href || activeRun.chatUrl });
        return { runId: activeRun.runId, status: "done", reason: ship.reason, inspected, idlePolls };
      }
      // Idle but nothing verifiable yet — keep as running, do not mark done
      updateRun(state, activeRun.runId, {
        probe: { status: "idle-unverified", idlePolls, checkedAt: new Date().toISOString(), verifyReason: ship.reason, bodySample: inspected.bodySample, activeMarkers: inspected.activeMarkers },
      });
      return { runId: activeRun.runId, status: "idle-unverified", reason: ship.reason, inspected, idlePolls };
    }
  }

  return {
    runId: activeRun.runId,
    status: inspected.status,
    inspected,
    idlePolls,
  };
}

function commandDispatch(flags) {
  const state = loadState();
  const staleMin = (flags['recover-stale-minutes'] && flags['recover-stale-minutes'] !== true) ? Number(flags['recover-stale-minutes']) : 90;
  const recovered = recoverStaleRuns(state, staleMin);
  if (recovered.length > 0) { console.log('Recovered stale runs: ' + recovered.join(', ')); saveState(state); }
  const activeRunStatus = reconcileActiveRun(state, flags);
  if (activeRunStatus) {
    saveState(state);
    if (activeRunStatus.status === "done") {
      console.log(`Auto-completed run ${activeRunStatus.runId} after ${activeRunStatus.idlePolls} idle polls.`);
    } else {
      console.log(
        `Active run ${activeRunStatus.runId} still ${activeRunStatus.status}; not dispatching a new task.`,
      );
      return;
    }
  }
  const task = selectTask(state, flags);
  if (!task) {
    console.log("No pending tasks.");
    return;
  }
  const conflict = findConflictingRun(state, task);
  if (conflict) {
    fail(`Refusing duplicate dispatch. Active run ${conflict.runId} already owns ${task.taskId}.`);
  }

  const prompt = buildPrompt(task);
  const targetUrl = task.chatUrl || "https://chatgpt.com/codex";
  const run = createRunRecord(task, "", targetUrl);
  const promptPath = writePromptFile(runsDir, run.runId, prompt);
  run.promptPath = promptPath;
  addRun(state, run);
  saveState(state);

  if (flags["dry-run"]) {
    updateRun(state, run.runId, {
      status: "blocked",
      error: "Dry run only. Prompt written without sending.",
    });
    saveState(state);
    console.log(prompt);
    return;
  }

  updateRun(state, run.runId, {
    status: "running",
    startedAt: new Date().toISOString(),
  });
  saveState(state);

  try {
    // Record the current top task URL BEFORE submitting so we can detect the new one
    const prevTaskUrl = getLatestTaskUrl(targetUrl);
    const result = sendPromptToCodex(prompt, { targetUrl });
    // Poll up to 30s for Codex to create a NEW task (URL different from prevTaskUrl)
    let taskUrl = result.chatUrl;
    for (let _i = 0; _i < 10; _i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      const polledUrl = getLatestTaskUrl(targetUrl);
      if (polledUrl && polledUrl.includes("/tasks/") && polledUrl !== prevTaskUrl) {
        taskUrl = polledUrl; break;
      }
    }
    updateRun(state, run.runId, {
      status: "running",
      chatUrl: taskUrl,
      error: null,
    });
    saveState(state);
    console.log(`Dispatched ${task.taskId} as run ${run.runId}`);
    console.log(`Chat URL: ${taskUrl}`);
  } catch (error) {
    updateRun(state, run.runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    saveState(state);
    throw error;
  }
}

function commandProbeActiveRun(flags) {
  const state = loadState();
  const activeRun = findOldestActiveRun(state);
  if (!activeRun) {
    console.log("No active runs.");
    return;
  }

  const result = reconcileActiveRun(state, flags);
  saveState(state);
  console.log(JSON.stringify(result, null, 2));
}

function commandComplete(flags) {
  const runId = requireFlag(flags, "run-id");
  const status = requireFlag(flags, "status");
  if (!["done", "blocked", "failed", "cancelled"].includes(status)) {
    fail(`Unsupported status ${status}`);
  }

  const state = loadState();
  const run = findRun(state, runId);
  if (!run) {
    fail(`Unknown run ${runId}`);
  }

  updateRun(state, runId, {
    status,
    chatUrl: flags["chat-url"] && flags["chat-url"] !== true ? String(flags["chat-url"]) : run.chatUrl,
    error: flags.error && flags.error !== true ? String(flags.error) : null,
  });
  saveState(state);
  console.log(`Updated ${runId} -> ${status}`);
}

function commandList() {
  const state = loadState();
  if (state.tasks.length === 0) {
    console.log("No tasks queued.");
    return;
  }

  for (const task of state.tasks) {
    console.log(
      `${task.taskId}\t${task.status}\t${task.branch}\t${task.lastRunId || "-"}\t${task.title}`,
    );
  }
}

const { command, flags } = parseArgs(process.argv.slice(2));

try {
  switch (command) {
    case "enqueue-task":
      commandEnqueue(flags);
      break;
    case "dispatch-next":
      commandDispatch(flags);
      break;
    case "probe-active-run":
      commandProbeActiveRun(flags);
      break;
    case "complete-run":
      commandComplete(flags);
      break;
    case "list":
      commandList();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
