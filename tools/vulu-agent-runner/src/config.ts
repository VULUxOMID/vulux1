import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunnerConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = path.resolve(__dirname, "..");

export function getToolRoot(): string {
  return TOOL_ROOT;
}

export function loadConfig(configPath = process.env.VULU_AGENT_RUNNER_CONFIG): RunnerConfig {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.join(TOOL_ROOT, "config.example.json");
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw) as RunnerConfig;
}

export function resolveStateFile(config: RunnerConfig): string {
  const override = process.env.VULU_AGENT_STATE_FILE;
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(TOOL_ROOT, config.runner.stateFile);
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
