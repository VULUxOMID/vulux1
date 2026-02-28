import { execSync } from "node:child_process";

const requiredEnvVars = [
  "EXPO_PUBLIC_SPACETIMEDB_URI",
  "EXPO_PUBLIC_SPACETIMEDB_NAME",
  "EXPO_PUBLIC_ENABLE_REALTIME",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_BACKEND_TOKEN_TEMPLATE",
  "EXPO_PUBLIC_DATA_SOURCE",
];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(`[build-web] Warning: Missing env vars: ${missing.join(", ")}`);
  console.warn("[build-web] The build will proceed but some features may not work.");
}

console.log("[build-web] Building Expo web with environment:");
for (const key of requiredEnvVars) {
  const value = process.env[key];
  if (value) {
    const masked = key.includes("KEY") ? value.slice(0, 10) + "..." : value;
    console.log(`  ${key}=${masked}`);
  } else {
    console.log(`  ${key}=(not set)`);
  }
}

execSync("npx expo export --platform web --output-dir dist", {
  stdio: "inherit",
  env: process.env,
});

console.log("[build-web] Done!");
