import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { route } from "@/server/route";
import { json } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { getBroadcastState } from "@/server/broadcast/schedule";
import { getSettings } from "@/server/settings";
import { serverNowMs, clockOffsetMs } from "@/server/time/clock";
import { paymentContractAddress } from "@/server/chain/client";
import { quoteSignerAddress } from "@/server/chain/quoteSigner";
import { activeChain, explorerAddressUrl } from "@/lib/chain/chains";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const channels = await db().select().from(schema.channels).orderBy(schema.channels.sortOrder);
  const states = await Promise.all(channels.filter((c) => c.isActive).map((c) => getBroadcastState(c.id)));
  const [counts] = await db()
    .select({
      queued: sql<number>`count(*) filter (where ${schema.campaigns.status} in ('QUEUED','PAID'))`,
      airing: sql<number>`count(*) filter (where ${schema.campaigns.status} = 'AIRING')`,
      awaiting: sql<number>`count(*) filter (where ${schema.campaigns.status} = 'AWAITING_PAYMENT')`,
      completed: sql<number>`count(*) filter (where ${schema.campaigns.status} = 'COMPLETED')`,
    })
    .from(schema.campaigns);
  const pendingModeration = await db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.creatives)
    .where(eq(schema.creatives.status, "VALID"));
  const failed = await db()
    .select()
    .from(schema.adActivations)
    .where(inArray(schema.adActivations.status, ["FAILED"]))
    .orderBy(desc(schema.adActivations.createdAt))
    .limit(10);
  const [revenue] = await db()
    .select({ total: sql<string>`coalesce(sum(${schema.payments.amountWei}), 0)::text`, count: sql<number>`count(*)` })
    .from(schema.payments)
    .where(and(eq(schema.payments.status, "CONFIRMED")));
  const contract = paymentContractAddress();
  return json({
    serverTime: serverNowMs(),
    simulatedOffsetMs: clockOffsetMs(),
    settings: await getSettings(),
    chain: { id: activeChain().id, name: activeChain().name, contract, contractUrl: contract ? explorerAddressUrl(contract) : null, quoteSigner: quoteSignerAddress() },
    channels: states,
    counts: { ...counts, pendingModeration: Number(pendingModeration[0]?.n ?? 0) },
    revenue: { totalWei: revenue?.total ?? "0", payments: Number(revenue?.count ?? 0) },
    failedActivations: failed,
  });
});
