import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pool = null;

export function isDatabaseConfigured(env = process.env) {
  return typeof env.DATABASE_URL === "string" && env.DATABASE_URL.trim().length > 0;
}

export function getPool(env = process.env) {
  if (!isDatabaseConfigured(env)) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === "0" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) {
    throw Object.assign(new Error("DATABASE_URL is not configured."), { statusCode: 503 });
  }
  return activePool.query(text, params);
}

export async function withTransaction(work) {
  const activePool = getPool();
  if (!activePool) {
    throw Object.assign(new Error("DATABASE_URL is not configured."), { statusCode: 503 });
  }
  const client = await activePool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  const activePool = getPool();
  if (!activePool) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const migrationsDir = path.join(rootDir, "migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort();

  for (const fileName of migrationFiles) {
    const migrationId = fileName.replace(/\.sql$/, "");
    const sql = await readFile(path.join(migrationsDir, fileName), "utf8");

    await activePool.query(sql);
    await activePool.query(
      "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
      [migrationId],
    );
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
