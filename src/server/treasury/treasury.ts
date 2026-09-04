import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { getSettings } from "../settings";
import { explorerTxUrl } from "@/lib/chain/chains";
import { audit, type Actor } from "../audit";
import { HttpError } from "../http";
import type { TreasuryEntry } from "../db/schema";

/**
 * The AIRTIME treasury.
 *
 * Policy: a configured share of everything the network earns is used to buy
 * Anduril pre-stock, which is then distributed to holders.
 *
 * Two very different kinds of number meet here, and the split is deliberate:
 *
 *   Derived   – airtime revenue. Computed from confirmed payments, each of which
 *               was verified against an on-chain AirtimePurchased event. Nobody
 *               types these in.
 *   Recorded  – token-tax inflows, pre-stock purchases and distributions. These
 *               happen off this chain (through a broker), so an operator records
 *               them with an optional reference. They are always presented as
 *               recorded figures, never as anything the chain proves.
 */

export interface TreasurySummary {
  /** Basis points of income earmarked for pre-stock. 10000 = 100%. */
  allocationBps: number;
  /** Confirmed, non-refunded airtime payments. Derived from verified events. */
  airtimeRevenueWei: string;
  airtimePayments: number;
  /** Operator-recorded token tax received. */
  taxInflowWei: string;
  /** airtimeRevenue + taxInflow */
  totalInflowWei: string;
  /** Earmarked for pre-stock under the current policy. */
  earmarkedWei: string;
  /** Actually spent buying pre-stock, as recorded. */
  deployedWei: string;
  /** Earmarked minus deployed; never below zero. */
  awaitingDeploymentWei: string;
  /** Pre-stock acquired / distributed / still held, as recorded. */
  sharesAcquired: string;
  sharesDistributed: string;
  sharesHeld: string;
  holdersReached: number;
  purchases: number;
  distributions: number;
  lastPurchaseAt: string | null;
  lastDistributionAt: string | null;
}

export interface TreasuryLedgerRow {
  id: string;
  kind: TreasuryEntry["kind"];
  occurredAt: string;
  amountWei: string;
  assetSymbol: string;
  shares: string;
  pricePerShareWei: string | null;
  holders: number | null;
  txHash: string | null;
  txUrl: string | null;
  reference: string | null;
  note: string | null;
  isDevData: boolean;
}

/** Postgres returns numeric(30,6) padded ("12.500000"); show it the way a person writes it. */
function trimDecimal(v: string): string {
  if (!v.includes(".")) return v || "0";
  const trimmed = v.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

function decimalAdd(a: string, b: string): string {
  // Share quantities are fixed-point decimals with 6 places; add them as integers.
  const scale = (v: string) => {
    const [i, f = ""] = (v || "0").split(".");
    return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)) * (i.startsWith("-") ? -1n : 1n);
  };
  const total = scale(a) + scale(b);
  const neg = total < 0n;
  const abs = neg ? -total : total;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export async function getTreasurySummary(): Promise<TreasurySummary> {
  const settings = await getSettings();
  const database = db();

  const [revenue] = await database
    .select({
      total: sql<string>`coalesce(sum(${schema.payments.amountWei}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.payments)
    .where(and(eq(schema.payments.status, "CONFIRMED"), ne(schema.payments.paymentToken, "__never__")));

  const rows = await database
    .select({
      kind: schema.treasuryEntries.kind,
      amount: sql<string>`coalesce(sum(${schema.treasuryEntries.amountWei}), 0)::text`,
      shares: sql<string>`coalesce(sum(${schema.treasuryEntries.shares}), 0)::text`,
      holders: sql<number>`coalesce(sum(${schema.treasuryEntries.holders}), 0)::int`,
      count: sql<number>`count(*)::int`,
      last: sql<string | null>`max(${schema.treasuryEntries.occurredAt})::text`,
    })
    .from(schema.treasuryEntries)
    .groupBy(schema.treasuryEntries.kind);

  const by = (kind: TreasuryEntry["kind"]) => rows.find((r) => r.kind === kind);
  const tax = by("TAX_INFLOW");
  const buy = by("STOCK_PURCHASE");
  const dist = by("DISTRIBUTION");

  const airtimeRevenueWei = BigInt(revenue?.total ?? "0");
  const taxInflowWei = BigInt(tax?.amount ?? "0");
  const totalInflowWei = airtimeRevenueWei + taxInflowWei;
  const allocationBps = BigInt(settings.treasuryAllocationBps);
  const earmarkedWei = (totalInflowWei * allocationBps) / 10_000n;
  const deployedWei = BigInt(buy?.amount ?? "0");
  const awaiting = earmarkedWei > deployedWei ? earmarkedWei - deployedWei : 0n;

  const sharesAcquired = trimDecimal(buy?.shares ?? "0");
  const sharesDistributed = trimDecimal(dist?.shares ?? "0");

  return {
    allocationBps: settings.treasuryAllocationBps,
    airtimeRevenueWei: airtimeRevenueWei.toString(),
    airtimePayments: Number(revenue?.count ?? 0),
    taxInflowWei: taxInflowWei.toString(),
    totalInflowWei: totalInflowWei.toString(),
    earmarkedWei: earmarkedWei.toString(),
    deployedWei: deployedWei.toString(),
    awaitingDeploymentWei: awaiting.toString(),
    sharesAcquired,
    sharesDistributed,
    sharesHeld: trimDecimal(decimalAdd(sharesAcquired, `-${sharesDistributed}`)),
    holdersReached: Number(dist?.holders ?? 0),
    purchases: Number(buy?.count ?? 0),
    distributions: Number(dist?.count ?? 0),
    lastPurchaseAt: buy?.last ? new Date(buy.last).toISOString() : null,
    lastDistributionAt: dist?.last ? new Date(dist.last).toISOString() : null,
  };
}

export async function getTreasuryLedger(limit = 100): Promise<TreasuryLedgerRow[]> {
  const rows = await db().select().from(schema.treasuryEntries).orderBy(desc(schema.treasuryEntries.occurredAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurredAt.toISOString(),
    amountWei: r.amountWei,
    assetSymbol: r.assetSymbol,
    shares: trimDecimal(r.shares),
    pricePerShareWei: r.pricePerShareWei,
    holders: r.holders,
    txHash: r.txHash,
    txUrl: r.txHash ? explorerTxUrl(r.txHash) : null,
    reference: r.reference,
    note: r.note,
    isDevData: r.isDevData,
  }));
}

export interface TreasuryEntryInput {
  kind: TreasuryEntry["kind"];
  occurredAt: Date;
  amountWei?: string;
  assetSymbol?: string;
  shares?: string;
  pricePerShareWei?: string | null;
  holders?: number | null;
  txHash?: string | null;
  reference?: string | null;
  note?: string | null;
}

export async function recordTreasuryEntry(input: TreasuryEntryInput, actor: Actor): Promise<TreasuryEntry> {
  if (input.kind === "STOCK_PURCHASE" && (!input.shares || Number(input.shares) <= 0)) {
    throw new HttpError(400, "A pre-stock purchase must record the number of shares acquired");
  }
  if (input.kind === "DISTRIBUTION") {
    if (!input.shares || Number(input.shares) <= 0) throw new HttpError(400, "A distribution must record the number of shares distributed");
    const summary = await getTreasurySummary();
    if (Number(input.shares) > Number(summary.sharesHeld) + 1e-6) {
      throw new HttpError(409, `Cannot distribute ${input.shares} shares; only ${summary.sharesHeld} are recorded as held`);
    }
  }
  if (input.kind === "TAX_INFLOW" && (!input.amountWei || BigInt(input.amountWei) <= 0n)) {
    throw new HttpError(400, "A tax inflow must record an amount");
  }

  const [row] = await db()
    .insert(schema.treasuryEntries)
    .values({
      kind: input.kind,
      occurredAt: input.occurredAt,
      amountWei: input.amountWei ?? "0",
      assetSymbol: input.assetSymbol ?? "ETH",
      shares: input.shares ?? "0",
      pricePerShareWei: input.pricePerShareWei ?? null,
      holders: input.holders ?? null,
      txHash: input.txHash ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      createdBy: actor.id ?? null,
    })
    .returning();
  await audit(actor, `treasury.${input.kind.toLowerCase()}`, { type: "treasuryEntry", id: row.id }, { amountWei: row.amountWei, shares: row.shares });
  return row;
}

export async function deleteTreasuryEntry(id: string, actor: Actor): Promise<void> {
  const [row] = await db().delete(schema.treasuryEntries).where(eq(schema.treasuryEntries.id, id)).returning();
  if (!row) throw new HttpError(404, "Entry not found");
  await audit(actor, "treasury.deleted", { type: "treasuryEntry", id }, { kind: row.kind, amountWei: row.amountWei, shares: row.shares });
}
