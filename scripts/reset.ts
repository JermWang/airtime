import "./_env";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Development reset: deletes the embedded PGlite database and local uploads.
 * Refuses to run when DATABASE_URL points at a real Postgres.
 */
if (process.env.DATABASE_URL) {
  console.error("Refusing to reset: DATABASE_URL is set. Drop the database manually.");
  process.exit(1);
}
const dir = process.env.AIRTIME_PGLITE_DIR || path.join(process.cwd(), ".pglite");
if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.log("removed", dir);
}
const uploads = path.join(process.cwd(), process.env.STORAGE_LOCAL_DIR || "storage", "creatives");
if (existsSync(uploads)) {
  rmSync(uploads, { recursive: true, force: true });
  console.log("removed", uploads);
}
console.log("reset complete – run `pnpm db:seed` or `pnpm dev`");
