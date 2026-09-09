import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Isolated, in-memory environment for API tests.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.AIRTIME_DB_MEMORY = "1";
process.env.DATABASE_URL = "";
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "local";
process.env.AIRTIME_DISABLE_TICKER = "true";
process.env.AIRTIME_SEED_DEV_DATA = "true";
process.env.SOLANA_TREASURY_ADDRESS = "11111111111111111111111111111112";
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "airtime-test-"));
process.env.ADMIN_PASSWORD = "test-admin";
process.env.SOLANA_RPC_URL = "http://127.0.0.1:1"; // unreachable on purpose: tests must not need a chain
