#!/usr/bin/env node

import { closePool, runMigrations } from "../src/db.js";

try {
  await runMigrations();
  console.log("[railway-backend] migrations applied");
} finally {
  await closePool();
}
