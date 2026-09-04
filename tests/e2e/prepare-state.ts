import { existsSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Wipes the end-to-end database and uploads.
 *
 * This runs as the first step of the E2E web-server command, so the state is
 * only ever removed immediately before the server that owns it starts. Deleting
 * it from the Playwright config or from global setup would pull the directory
 * out from under a server that is already running (PGlite then fails with
 * "could not open file ...").
 */
const root = path.resolve(__dirname, "..", "..");
for (const dir of [".pglite-e2e", "storage-e2e"]) {
  const target = path.join(root, dir);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[e2e] removed ${dir}`);
  }
}
