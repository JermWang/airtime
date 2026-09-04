import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { env } from "../env";

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
    const pool = new Pool({ connectionString: e.DATABASE_URL, max: 10 });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      kind: "pg",
      close: () => pool.end(),
      migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    };
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
