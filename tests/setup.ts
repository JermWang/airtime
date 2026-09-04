import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Isolated, in-memory environment for API tests.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.AIRTIME_DB_MEMORY = "1";
process.env.DATABASE_URL = "";
process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.AIRTIME_DISABLE_TICKER = "true";
process.env.AIRTIME_SEED_DEV_DATA = "true";
process.env.NEXT_PUBLIC_AIRTIME_PAYMENT_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
process.env.AIRTIME_PAYMENT_CONFIRMATIONS = "1";
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "airtime-test-"));
process.env.ADMIN_PASSWORD = "test-admin";
process.env.LOCAL_RPC_URL = "http://127.0.0.1:1"; // unreachable on purpose: tests must not need a chain
