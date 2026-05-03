#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const port = String(39000 + Math.floor(Math.random() * 1000));
const child = spawn(process.execPath, ["src/server.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: port,
    RTC_ENABLE: "1",
    RTC_STUN_URLS: "stun:stun.l.google.com:19302",
    CLERK_JWKS_URL: "",
    CLERK_JWT_ISSUER: "",
    CLERK_JWT_AUDIENCE: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

function stop() {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  const url = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (payload?.rtcReady === true && payload?.rtcAuthReady === true) {
          return payload;
        }
        throw new Error(`Unexpected health payload: ${JSON.stringify(payload)}`);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for RTC health at ${url}`);
}

try {
  const payload = await waitForHealth();
  console.log(`[rtc-smoke] Railway RTC health OK: ${JSON.stringify(payload)}`);
} finally {
  stop();
}
