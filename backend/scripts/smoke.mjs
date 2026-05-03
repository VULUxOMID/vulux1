#!/usr/bin/env node

import process from "node:process";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8787").trim();
const token = (process.env.SMOKE_BEARER_TOKEN ?? process.env.SMOKE_CLERK_JWT ?? "").trim();

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function main() {
  console.log(`Upload presign smoke test against ${baseUrl}`);

  const healthResponse = await fetch(new URL("/health", baseUrl));
  const healthBody = await parseJson(healthResponse);
  if (!healthResponse.ok || healthBody?.ok !== true) {
    throw new Error(`Health check failed: status=${healthResponse.status} body=${JSON.stringify(healthBody)}`);
  }
  console.log("GET /health passed");

  const unauthorizedResponse = await fetch(new URL("/presign", baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType: "image/jpeg",
      mediaType: "image",
      size: 1024,
    }),
  });
  const unauthorizedBody = await parseJson(unauthorizedResponse);
  if (unauthorizedResponse.status !== 401) {
    throw new Error(
      `Unauthorized presign check failed: status=${unauthorizedResponse.status} body=${JSON.stringify(unauthorizedBody)}`,
    );
  }
  console.log("POST /presign rejects missing auth");

  if (!token) {
    console.log("Skipping authenticated presign check because SMOKE_BEARER_TOKEN is not set.");
    return;
  }

  const signResponse = await fetch(new URL("/presign", baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contentType: "image/jpeg",
      mediaType: "image",
      size: 1024,
    }),
  });
  const signBody = await parseJson(signResponse);
  if (!signResponse.ok || typeof signBody?.url !== "string") {
    throw new Error(
      `Signed upload check failed: status=${signResponse.status} body=${JSON.stringify(signBody)}`,
    );
  }

  console.log("POST /presign passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
