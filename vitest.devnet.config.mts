import { defineConfig } from "vitest/config";
import path from "node:path";
// Explicit opt-in: these tests send devnet-only tokens from local test keypairs.
export default defineConfig({
 resolve:{alias:{"@":path.resolve(import.meta.dirname,"src")}},
 test:{environment:"node",include:["tests/devnet/**/*.test.ts"],setupFiles:["tests/setup.ts"],testTimeout:240_000,hookTimeout:120_000,fileParallelism:false,server:{deps:{inline:["@electric-sql/pglite"]}}}
});
