import { handler } from "./http";
import { boot } from "./boot";

/** Route wrapper: ensures the process is booted (migrated/seeded) and applies uniform error handling. */
export function route<Ctx = unknown>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return handler<Ctx>(async (req, ctx) => {
    await boot();
    return fn(req, ctx);
  });
}

export type Params<T extends Record<string, string>> = { params: Promise<T> };
