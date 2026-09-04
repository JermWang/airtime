import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E: a fresh anvil chain + deployed AirtimePayments (global-setup) and a
 * dev server with an isolated embedded database and the local dev wallet.
 *
 * The contract lands at the deterministic first-deployment address of anvil
 * account #0, so the web server can be configured before global-setup runs.
 */
export const E2E_PORT = 3100;
export const E2E_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
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
    reuseExistingServer: true,
    timeout: 600_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_CHAIN_ENV: "local",
      NEXT_PUBLIC_AIRTIME_PAYMENT_CONTRACT: E2E_CONTRACT,
      AIRTIME_PAYMENT_CONTRACT_DEPLOY_BLOCK: "0",
      AIRTIME_PAYMENT_CONFIRMATIONS: "1",
      NEXT_PUBLIC_DEV_WALLET_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      AIRTIME_PGLITE_DIR: path.resolve(__dirname, ".pglite-e2e"),
      STORAGE_LOCAL_DIR: path.resolve(__dirname, "storage-e2e"),
      ADMIN_EMAIL: "admin@airtime.local",
      ADMIN_PASSWORD: "e2e-admin",
      AIRTIME_SEED_DEV_DATA: "true",
      LOCAL_RPC_URL: "http://127.0.0.1:8545",
      NEXT_PUBLIC_APP_URL: `http://localhost:${E2E_PORT}`,
      TREASURY_ADDRESS: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
      // Production build ⇒ real secrets are required. These are throwaway test values;
      // the signer is anvil account #9, which global-setup wires into the contract.
      AIRTIME_QUOTE_SIGNER_PRIVATE_KEY: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
      AIRTIME_SESSION_SECRET: "e2e-session-secret-0000000000000000000000000000000000",
      AIRTIME_UPLOAD_SECRET: "e2e-upload-secret-00000000000000000000000000000000000",
      AIRTIME_ALLOW_SIM_CLOCK: "true",
      NEXT_PUBLIC_MEDIA_ORIGINS: "https://test-streams.mux.dev,https://stream.mux.com,https://*.mux.com,https://interactive-examples.mdn.mozilla.net,https://upload.wikimedia.org",
    },
  },
});
