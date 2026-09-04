import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { getTreasurySummary, getTreasuryLedger, recordTreasuryEntry } from "@/server/treasury/treasury";

export const dynamic = "force-dynamic";

const body = z.object({
  kind: z.enum(["TAX_INFLOW", "STOCK_PURCHASE", "DISTRIBUTION"]),
  occurredAt: z.string().datetime().optional(),
  amountWei: z.string().regex(/^\d+$/).optional(),
  assetSymbol: z.string().min(1).max(12).optional(),
  shares: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  pricePerShareWei: z.string().regex(/^\d+$/).optional().nullable(),
  holders: z.number().int().min(0).max(10_000_000).optional().nullable(),
  txHash: z.string().max(120).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const GET = route(async () => {
  await requireAdmin();
  const [summary, ledger] = await Promise.all([getTreasurySummary(), getTreasuryLedger(200)]);
  return json({ summary, ledger });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, body);
  const entry = await recordTreasuryEntry(
    { ...input, occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date() },
    { type: "ADMIN", id: admin.adminId },
  );
  return json({ entry, summary: await getTreasurySummary() }, { status: 201 });
});
