import fs from "node:fs";
import path from "node:path";

import type { LockRecord, ProcessedEvent, StateSnapshot } from "./types.js";

function emptyState(): StateSnapshot {
  return {
    processed: {},
    locks: {},
  };
}

export class StateStore {
  constructor(private readonly filePath: string) {}

  private read(): StateSnapshot {
    if (!fs.existsSync(this.filePath)) {
      return emptyState();
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as StateSnapshot;
  }

  private write(state: StateSnapshot): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  shouldProcess(key: string, fingerprint: string, cooldownMs: number): boolean {
    const state = this.read();
    const record = state.processed[key];
    if (!record) {
      return true;
    }
    if (record.fingerprint === fingerprint) {
      return false;
    }
    return Date.now() - Date.parse(record.processedAt) > cooldownMs;
  }

  markProcessed(key: string, fingerprint: string): ProcessedEvent {
    const state = this.read();
    const record: ProcessedEvent = {
      fingerprint,
      processedAt: new Date().toISOString(),
    };
    state.processed[key] = record;
    this.write(state);
    return record;
  }

  acquireLock(key: string, reason: string, ttlMs: number): boolean {
    const state = this.read();
    const existing = state.locks[key];
    if (existing && Date.parse(existing.expiresAt) > Date.now()) {
      return false;
    }
    const lock: LockRecord = {
      reason,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    state.locks[key] = lock;
    this.write(state);
    return true;
  }

  releaseLock(key: string): void {
    const state = this.read();
    delete state.locks[key];
    this.write(state);
  }
}
