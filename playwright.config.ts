import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/** Browser checks run against a production build with an isolated embedded database. */
export const E2E_PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] } } }],
  webServer: {
    // State is wiped by the server command itself, never by the config or global
    // setup: both of those can run while a reused server already owns the directory.
    command: "pnpm exec tsx tests/e2e/prepare-state.ts && pnpm exec next build && pnpm exec next start -p 3100",
    url: `http://localhost:${E2E_PORT}/api/time`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
      SOLANA_TREASURY_ADDRESS: "",
      DATABASE_URL: "",
      AIRTIME_PGLITE_DIR: path.resolve(__dirname, ".pglite-e2e"),
      STORAGE_LOCAL_DIR: path.resolve(__dirname, "storage-e2e"),
      ADMIN_EMAIL: "admin@airtime.local",
      ADMIN_PASSWORD: "e2e-admin",
      AIRTIME_SEED_DEV_DATA: "true",
      NEXT_PUBLIC_APP_URL: `http://localhost:${E2E_PORT}`,
      // Production build ⇒ real secrets are required. These are throwaway test values;

      AIRTIME_SESSION_SECRET: "e2e-session-secret-0000000000000000000000000000000000",
      AIRTIME_UPLOAD_SECRET: "e2e-upload-secret-00000000000000000000000000000000000",
      AIRTIME_ALLOW_SIM_CLOCK: "true",
      NEXT_PUBLIC_MEDIA_ORIGINS: "https://test-streams.mux.dev,https://stream.mux.com,https://*.mux.com,https://interactive-examples.mdn.mozilla.net,https://upload.wikimedia.org",
    },
  },
});
