function formatExpectedFiles(expectedFiles) {
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) {
    return "- none declared";
  }

  return expectedFiles.map((file) => `- ${file}`).join("\n");
}

export function buildPrompt(task) {
  const goal = String(task.body || "").trim();
  if (!goal) {
    throw new Error(`Task ${task.taskId} is missing a body.`);
  }

  return [
    `TASK_ID: ${task.taskId}`,
    `TITLE: ${task.title}`,
    `BRANCH: ${task.branch}`,
    `BASE_COMMIT: ${task.baseCommit}`,
    `TICKET_URL: ${task.ticketUrl || "none"}`,
    "",
    "You are working on one isolated task in the VULUxOMID/vulux1 repo.",
    "",
    "Hard constraints:",
    "- Reuse the declared branch if it already exists for this task.",
    "- Do not start a duplicate implementation if the task is already in progress.",
    "- Stay within the expected file area unless the task forces a broader change.",
    "- End with a short summary, explicit test status, and any blocker that still remains.",
    "",
    "Expected files:",
    formatExpectedFiles(task.expectedFiles),
    "",
    "Goal:",
    goal,
    "",
    "Required close-out:",
    "- Confirm branch used",
    "- Confirm files changed",
    "- Confirm tests run or why not",
    "- Confirm whether follow-up work is required",
    "",
    `IDEMPOTENCY_KEY: ${task.taskId}@${task.baseCommit}`,
  ].join("\n");
}
