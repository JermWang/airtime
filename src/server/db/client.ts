import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { env } from "../env";
import { isServerless } from "../platform";

/**
 * Database client.
 *
 * - DATABASE_URL set  → node-postgres pool (production / staging)
 * - DATABASE_URL empty → embedded PGlite (real Postgres in-process) stored in ./.pglite,
 *                        or fully in-memory when AIRTIME_DB_MEMORY=1 (tests).
 *
 * Both drivers speak the same Drizzle API; we expose the node-postgres type as the
 * canonical `Db` type for the rest of the server.
 */
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface DbHandle {
  db: Db;
  kind: "pg" | "pglite";
  close: () => Promise<void>;
  migrate: () => Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __airtimeDb: DbHandle | undefined;
  // eslint-disable-next-line no-var
  var __airtimeMigrated: Promise<void> | undefined;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Arbitrary but stable key for the migration advisory lock. */
const AIRTIME_MIGRATION_LOCK = 4663_0001;

/**
 * PGlite is a single embedded Postgres instance and is **not** safe to drive
 * from overlapping async callers: the scheduler tick, an SSE stream and a few
 * concurrent requests will interleave statements and corrupt its virtual file
 * system ("could not open file ..."). Every entry point is therefore funnelled
 * through one promise chain. Transactions are serialised as a whole, and the
 * statements inside them run on PGlite's own transaction handle, so this cannot
 * deadlock. Real Postgres (node-postgres) has a connection pool and needs none
 * of this.
 */

function createHandle(): DbHandle {
  const e = env();
  if (e.DATABASE_URL) {
    const pool = new Pool({ connectionString: e.DATABASE_URL, max: isServerless() ? 1 : 10 });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      kind: "pg",
      close: () => pool.end(),
      // Several instances can cold-start at once (every serverless invocation is
      // a fresh process), so migrations run under a Postgres advisory lock.
      migrate: async () => {
        const client = await pool.connect();
        try {
          await client.query("select pg_advisory_lock($1)", [AIRTIME_MIGRATION_LOCK]);
          await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
        } finally {
          await client.query("select pg_advisory_unlock($1)", [AIRTIME_MIGRATION_LOCK]).catch(() => {});
          client.release();
        }
      },
    };
  }
  if (isServerless()) {
    throw new Error(
      "No DATABASE_URL set. AIRTIME falls back to an embedded PGlite database that writes to the local disk, which cannot work on a serverless host: the filesystem is read-only and every invocation gets a fresh container. Set DATABASE_URL to a managed Postgres instance (Vercel Postgres, Neon, Supabase, …).",
    );
  }
  const inMemory = process.env.AIRTIME_DB_MEMORY === "1";
  const dataDir = inMemory ? undefined : process.env.AIRTIME_PGLITE_DIR || path.join(process.cwd(), ".pglite");
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    kind: "pglite",
    close: () => client.close(),
    migrate: () => migratePglite(db as unknown as ReturnType<typeof drizzlePglite<typeof schema>>, { migrationsFolder: MIGRATIONS_FOLDER }),
  };
}

export function getDbHandle(): DbHandle {
  if (!globalThis.__airtimeDb) {
    globalThis.__airtimeDb = createHandle();
  }
  return globalThis.__airtimeDb;
}

export function db(): Db {
  return getDbHandle().db;
}

/**
 * Idempotent; safe to call from instrumentation, route handlers and scripts.
 * The promise lives on globalThis so duplicate module instances (Next.js dev
 * evaluates a module once per bundle) never migrate concurrently.
 */
export function ensureMigrated(): Promise<void> {
  if (!globalThis.__airtimeMigrated) {
    globalThis.__airtimeMigrated = getDbHandle()
      .migrate()
      .catch((err) => {
        globalThis.__airtimeMigrated = undefined;
        throw err;
      });
  }
  return globalThis.__airtimeMigrated;
}

export async function closeDb(): Promise<void> {
  const h = globalThis.__airtimeDb;
  if (h) {
    globalThis.__airtimeDb = undefined;
    globalThis.__airtimeMigrated = undefined;
    await h.close();
  }
}

export { schema };
