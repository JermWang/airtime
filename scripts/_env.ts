import { existsSync } from "node:fs";
import path from "node:path";

/** Load .env.local / .env for standalone scripts (Next.js does this itself). */
for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}
