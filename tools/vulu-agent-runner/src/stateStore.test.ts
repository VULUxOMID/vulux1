import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileStateStore } from "./stateStore.js";

test("FileStateStore serializes concurrent state mutations without dropping entries", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "vulu-agent-runner-state-"));
  const store = new FileStateStore(rootDir, 60_000);
  await store.initialize();

  await Promise.all([
    ...Array.from({ length: 10 }, (_, index) =>
      store.markProcessed(`processed-${index}`, {
        source: "test",
        issueId: `issue-${index}`,
      })
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      store.recordCompletion({
        dedupeKey: `completion-${index}`,
        status: "success",
        issueId: `issue-${index}`,
      })
    ),
  ]);

  const raw = await fs.readFile(path.join(rootDir, "state.json"), "utf8");
  const parsed = JSON.parse(raw) as {
    processed: Record<string, unknown>;
    completions: Record<string, unknown>;
  };

  assert.equal(Object.keys(parsed.processed).length, 10);
  assert.equal(Object.keys(parsed.completions).length, 10);
});
