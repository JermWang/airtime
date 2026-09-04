import { db, schema, type Tx } from "./db/client";

export type Actor = { type: "ADMIN" | "SYSTEM" | "WALLET"; id?: string | null };

export async function audit(
  actor: Actor,
  action: string,
  target?: { type: string; id: string } | null,
  details: Record<string, unknown> = {},
  tx?: Tx,
): Promise<void> {
  const executor = tx ?? db();
  await executor.insert(schema.auditLogs).values({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    details,
  });
}

export const SYSTEM: Actor = { type: "SYSTEM", id: "scheduler" };
