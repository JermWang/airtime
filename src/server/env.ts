import { z } from "zod";

/**
 * Server-side environment. Parsed once, validated with Zod.
 * NEXT_PUBLIC_* values are also readable here, but secrets must never be
 * exported through anything that reaches the browser.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_CHAIN_ENV: z.enum(["local", "testnet", "mainnet"]).default("local"),
  ROBINHOOD_MAINNET_RPC_URL: z.string().default("https://rpc.mainnet.chain.robinhood.com"),
  ROBINHOOD_TESTNET_RPC_URL: z.string().default("https://rpc.testnet.chain.robinhood.com"),
  LOCAL_RPC_URL: z.string().default("http://127.0.0.1:8545"),
  AIRTIME_QUOTE_SIGNER_PRIVATE_KEY: z.string().optional().default(""),
  NEXT_PUBLIC_AIRTIME_PAYMENT_CONTRACT: z.string().optional().default(""),
  AIRTIME_PAYMENT_CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().nonnegative().default(0),
  AIRTIME_PAYMENT_CONFIRMATIONS: z.coerce.number().int().min(0).max(64).default(1),
  /** The AIRTIME treasury. Every airtime payment is sent here and confirmed from it. */
  NEXT_PUBLIC_TREASURY_ADDRESS: z.string().optional().default("0xaF259a8Daf123Db203Fe5eA39fc9BE1b98048601"),
  TREASURY_ADDRESS: z.string().optional().default(""),
  /** RPC for Ethereum mainnet, the second chain a buyer may pay from. */
  ETHEREUM_RPC_URL: z.string().optional().default(""),
  AIRTIME_SESSION_SECRET: z.string().optional().default(""),
  AIRTIME_UPLOAD_SECRET: z.string().optional().default(""),
  ADMIN_EMAIL: z.string().default("admin@airtime.local"),
  ADMIN_PASSWORD: z.string().optional().default(""),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  STORAGE_S3_BUCKET: z.string().optional().default(""),
  STORAGE_S3_REGION: z.string().optional().default(""),
  STORAGE_S3_ENDPOINT: z.string().optional().default(""),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional().default(""),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  STORAGE_PUBLIC_BASE_URL: z.string().optional().default(""),
  MEDIA_PROVIDER: z.enum(["local"]).default("local"),
  AIRTIME_SEED_DEV_DATA: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  NEXT_PUBLIC_USDG_ADDRESS: z.string().optional().default(""),
  NEXT_PUBLIC_EXPLORER_URL: z.string().optional().default(""),
  NEXT_PUBLIC_DEV_WALLET_PRIVATE_KEY: z.string().optional().default(""),
  AIRTIME_CRON_SECRET: z.string().optional().default(""),
  AIRTIME_MIGRATE_ON_BOOT: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  AIRTIME_ALLOW_SIM_CLOCK: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  AIRTIME_DISABLE_TICKER: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
export const isMainnet = () => env().NEXT_PUBLIC_CHAIN_ENV === "mainnet";

/**
 * The station simulation clock moves every viewer's playback, quote expiry and
 * activation. It is available outside production, or wherever an operator has
 * explicitly opted in (staging, testnet, end-to-end tests). Never on mainnet.
 */
export const simulationClockAllowed = () => !isMainnet() && (!isProduction() || env().AIRTIME_ALLOW_SIM_CLOCK);

/** Dev data must never leak into a mainnet deployment. */
export const devDataAllowed = () => !isMainnet() && env().AIRTIME_SEED_DEV_DATA;

/**
 * Secrets that must exist in production but can be derived deterministically
 * in development so `pnpm dev` works out of the box. Derived dev secrets are
 * clearly not secure and are only used when NODE_ENV !== production.
 */
export function sessionSecret(): string {
  const e = env();
  if (e.AIRTIME_SESSION_SECRET) return e.AIRTIME_SESSION_SECRET;
  if (isProduction()) throw new Error("AIRTIME_SESSION_SECRET is required in production");
  return "airtime-dev-session-secret-not-for-production-0000000000";
}

export function uploadSecret(): string {
  const e = env();
  if (e.AIRTIME_UPLOAD_SECRET) return e.AIRTIME_UPLOAD_SECRET;
  if (isProduction()) throw new Error("AIRTIME_UPLOAD_SECRET is required in production");
  return "airtime-dev-upload-secret-not-for-production-00000000000";
}
