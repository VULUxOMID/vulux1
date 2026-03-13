export interface RunnerConfig {
  github: GithubConfig;
  runner: RunnerSettings;
  linear: LinearConfig;
  promptTemplates: Record<string, string>;
  routes: PromptRoute[];
}

export interface GithubConfig {
  owner: string;
  repo: string;
  dispatchEventType: string;
  branchPrefix: string;
  baseBranch: string;
}

export interface RunnerSettings {
  cooldownMinutes: number;
  lockTtlMinutes: number;
  fallbackLookbackMinutes: number;
  stateFile: string;
  listenPort: number;
  taskExecutionMode?: "local" | "github";
  repoPath?: string;
  runsDir?: string;
  autonomousLoop?: RunnerAutonomousLoopSettings;
}

export interface RunnerAutonomousLoopSettings {
  enabled?: boolean;
  pollSeconds?: number;
  maxConcurrentRuns?: number;
}

export interface LinearConfig {
  allowedLabels: string[];
  blockedLabels: string[];
  allowedStates: string[];
  safeIssueTypes: string[];
}

export interface PromptRoute {
  templateKey: string;
  matchLabels?: string[];
  matchIssueTypes?: string[];
  matchStates?: string[];
}

export interface RunnerIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url?: string;
  stateName?: string;
  labels: string[];
  issueType?: string;
  priority?: number;
  updatedAt?: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  teamId?: string;
  teamKey?: string;
  branchName?: string;
  prNumber?: number;
}

export interface DispatchPayload {
  source: "linear-webhook" | "linear-fallback" | "github-push" | "github-pr" | "manual-task";
  eventId: string;
  lockKey: string;
  branchName: string;
  issue: RunnerIssue;
  prompt: string;
  templateKey: string;
  repoOwner: string;
  repoName: string;
  branchPrefix: string;
  baseBranch: string;
}

export interface LocalRunHandle {
  mode: "local";
  taskId: string;
  branchName: string;
  worktreePath: string;
  promptPath: string;
  logPath: string;
  outputPath: string;
  pid?: number;
}

export interface LocalRunRecord {
  eventId: string;
  issue: RunnerIssue;
  branchName: string;
  repoRoot: string;
  createdAt: string;
  mode?: "local";
  status?: "running" | "completed" | "failed" | "orphaned";
  pid?: number | null;
  startedAt?: string;
  completedAt?: string;
  changed?: boolean;
  commitSha?: string;
  logPath?: string;
  outputPath?: string;
  worktreePath?: string;
  lastMessage?: string;
  error?: string;
  exitCode?: number;
}

export interface StateSnapshot {
  processed: Record<string, ProcessedEvent>;
  locks: Record<string, LockRecord>;
}

export interface ProcessedEvent {
  fingerprint: string;
  processedAt: string;
}

export interface LockRecord {
  reason: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface GithubSignalContext {
  eventName: string;
  eventId: string;
  repository: string;
  refName?: string;
  pullRequestNumber?: number;
  issueKey?: string;
  labels: string[];
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}
