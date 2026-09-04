import { and, eq, inArray } from "drizzle-orm";
import { parseEventLogs, parseAbiItem, type Hex, type Log } from "viem";
import { airtimePaymentsAbi } from "@/lib/chain/airtimePayments";
import { db, schema } from "../db/client";
import { serverNow } from "../time/clock";
import { publicClient, paymentContractAddress, requiredConfirmations } from "./client";
import { verifyTreasuryTransfer, treasuryAddress } from "./treasuryTransfer";
import { publish } from "../realtime/bus";
import { audit, SYSTEM } from "../audit";
import { takeSurface } from "../ads/activation";
import { env } from "../env";
import type { Quote } from "../db/schema";

/**
 * Payment verification.
 *
 * The browser never decides that something is paid. It may *hint* a tx hash
 * after the wallet reports a receipt, but the server always:
 *   1. fetches the receipt / logs from its own RPC
 *   2. finds an AirtimePurchased log emitted by OUR contract address
 *   3. checks quoteId, buyer, placement hash, creative hash, token and amount
 *      against the quote it signed
 *   4. requires N confirmations
 * Only then does the campaign move AWAITING_PAYMENT → PAID → AIRING, taking the
 * surface from whoever paid less for it.
 *
 * The same verification runs from the scheduler without any browser hint, so a
 * closed tab cannot lose a payment.
 */

const PURCHASED_EVENT = parseAbiItem(
  "event AirtimePurchased(bytes32 indexed quoteId, address indexed buyer, bytes32 indexed placementId, bytes32 creativeHash, uint64 startAt, uint64 endAt, address paymentToken, uint256 amount)",
);

type PurchasedLog = ReturnType<typeof parseEventLogs<typeof airtimePaymentsAbi, true, "AirtimePurchased">>[number];

export type VerifyOutcome = { status: "confirmed"; txHash: Hex; blockNumber: bigint } | { status: "pending"; reason: string } | { status: "not_found" } | { status: "mismatch"; reason: string };

function matches(log: PurchasedLog, quote: Quote, contract: string): string | null {
  if (log.address.toLowerCase() !== contract.toLowerCase()) return "log emitted by a different contract";
  const a = log.args;
  if (a.quoteId?.toLowerCase() !== quote.id.toLowerCase()) return "quoteId mismatch";
  if (a.buyer?.toLowerCase() !== quote.walletAddress.toLowerCase()) return "buyer mismatch";
  if (a.placementId?.toLowerCase() !== quote.placementIdHash.toLowerCase()) return "placement mismatch";
  if (a.creativeHash?.toLowerCase() !== quote.creativeHash.toLowerCase()) return "creative mismatch";
  if ((a.paymentToken ?? "").toLowerCase() !== quote.paymentToken.toLowerCase()) return "payment token mismatch";
  if (a.amount !== BigInt(quote.amountWei)) return "amount mismatch";
  if (a.startAt !== BigInt(Math.floor(quote.startsAt.getTime() / 1000))) return "start mismatch";
  if (a.endAt !== BigInt(Math.floor(quote.endsAt.getTime() / 1000))) return "end mismatch";
  return null;
}

interface PaymentRef {
  transactionHash: Hex;
  blockNumber: bigint;
  /** 0 for a treasury transfer: there is no log, and the unique index is (txHash, logIndex). */
  logIndex: number;
}

async function recordPayment(quote: Quote, log: PaymentRef): Promise<void> {
  const now = serverNow();
  await db().transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.payments).where(eq(schema.payments.quoteId, quote.id));
    if (existing) return;
    // Lock the surface before the campaign: takeSurface decides here whether this
    // payment displaces whoever is currently running.
    const [placement] = await tx.select().from(schema.placements).where(eq(schema.placements.id, quote.placementId)).for("update");
    const [campaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, quote.campaignId)).for("update");
    if (!campaign || !placement) return;

    const [payment] = await tx
      .insert(schema.payments)
      .values({
        campaignId: campaign.id,
        quoteId: quote.id,
        chainId: quote.chainId,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        buyer: quote.walletAddress,
        paymentToken: quote.paymentToken,
        amountWei: quote.amountWei,
        status: "CONFIRMED",
        confirmedAt: now,
      })
      .returning();

    await tx.update(schema.quotes).set({ status: "CONSUMED" }).where(eq(schema.quotes.id, quote.id));

    // Turn the buyer's hold into their occupancy record. It stays open-ended:
    // the run has no end until somebody outbids it.
    const [hold] = await tx.select().from(schema.reservations).where(and(eq(schema.reservations.quoteId, quote.id)));
    if (hold) {
      await tx.update(schema.reservations).set({ status: "CONFIRMED", startsAt: now, endsAt: null, expiresAt: null }).where(eq(schema.reservations.id, hold.id));
    } else {
      await tx.insert(schema.reservations).values({ placementId: quote.placementId, lane: placement.lane, campaignId: campaign.id, quoteId: quote.id, startsAt: now, endsAt: null, status: "CONFIRMED", expiresAt: null });
    }

    const amountWei = BigInt(quote.amountWei);
    await tx
      .update(schema.campaigns)
      .set({ status: "PAID", paymentId: payment.id, paidPriceWei: quote.amountWei, guaranteedUntil: quote.endsAt, activeQuoteId: null, updatedAt: now })
      .where(eq(schema.campaigns.id, campaign.id));
    await audit(SYSTEM, "payment.confirmed", { type: "campaign", id: campaign.id }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), amountWei: quote.amountWei }, tx);
    publish({ type: "payment.confirmed", campaignId: campaign.id, txHash: log.transactionHash });

    // Paid: take the surface now, displacing a cheaper occupant if there is one.
    const [paidCampaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    const result = await takeSurface(tx, { placement, campaign: paidCampaign, amountWei, guaranteedUntil: quote.endsAt, now });
    if (!result.ok) {
      // Only reachable if the hold lapsed and the transaction landed very late.
      // The money is on chain, so the campaign is flagged for an operator refund
      // rather than quietly dropped.
      await tx.update(schema.campaigns).set({ status: "REJECTED", rejectionReason: result.reason, updatedAt: now }).where(eq(schema.campaigns.id, campaign.id));
      await tx.update(schema.reservations).set({ status: "RELEASED", endsAt: now }).where(and(eq(schema.reservations.campaignId, campaign.id), eq(schema.reservations.status, "CONFIRMED")));
      await audit(SYSTEM, "campaign.lost_race", { type: "campaign", id: campaign.id }, { reason: result.reason, amountWei: quote.amountWei }, tx);
      publish({ type: "campaign.updated", campaignId: campaign.id, status: "REJECTED", placementId: campaign.placementId });
    }
  });
}

function extractPurchased(logs: Log[]): Array<PurchasedLog & { transactionHash: Hex; blockNumber: bigint; logIndex: number }> {
  const parsed = parseEventLogs({ abi: airtimePaymentsAbi, logs, eventName: "AirtimePurchased", strict: true });
  return parsed.filter((l) => l.transactionHash && l.blockNumber !== null && l.logIndex !== null) as Array<PurchasedLog & { transactionHash: Hex; blockNumber: bigint; logIndex: number }>;
}

/** True when this quote is settled by a native transfer into the treasury. */
export function isTreasuryQuote(quote: Quote): boolean {
  return quote.contractAddress.toLowerCase() === treasuryAddress().toLowerCase();
}

/**
 * Verify a treasury-transfer quote from a hinted hash. The hint is stored on the
 * quote first, so the scheduler can finish the job if the browser goes away
 * before the transaction has enough confirmations.
 */
async function verifyTransferQuote(quote: Quote, txHash: Hex): Promise<VerifyOutcome> {
  if (quote.txHint !== txHash) {
    await db().update(schema.quotes).set({ txHint: txHash }).where(eq(schema.quotes.id, quote.id));
  }
  const outcome = await verifyTreasuryTransfer(quote, txHash);
  if (outcome.status === "confirmed") {
    await recordPayment(quote, { transactionHash: outcome.txHash, blockNumber: outcome.blockNumber, logIndex: 0 });
  }
  return outcome;
}

/** Verify by a tx hash hinted from the browser. The hash is only a lookup key. */
export async function verifyQuoteByTxHash(quoteId: string, txHash: Hex): Promise<VerifyOutcome> {
  const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!quote) return { status: "not_found" };
  if (quote.status === "CONSUMED") {
    const [p] = await db().select().from(schema.payments).where(eq(schema.payments.quoteId, quoteId));
    return p ? { status: "confirmed", txHash: p.txHash as Hex, blockNumber: p.blockNumber } : { status: "not_found" };
  }
  if (isTreasuryQuote(quote)) return verifyTransferQuote(quote, txHash);
  const contract = paymentContractAddress();
  if (!contract) return { status: "pending", reason: "contract not configured" };
  const client = publicClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { status: "pending", reason: "receipt not available yet" };
  }
  if (receipt.status !== "success") return { status: "mismatch", reason: "transaction reverted" };
  const candidates = extractPurchased(receipt.logs).filter((l) => l.args.quoteId?.toLowerCase() === quote.id.toLowerCase());
  if (!candidates.length) return { status: "mismatch", reason: "no AirtimePurchased event for this quote in the transaction" };
  const log = candidates[0];
  const mismatch = matches(log, quote, contract);
  if (mismatch) return { status: "mismatch", reason: mismatch };
  const latest = await client.getBlockNumber();
  const confirmations = Number(latest - log.blockNumber) + 1;
  if (confirmations < requiredConfirmations()) return { status: "pending", reason: `${confirmations}/${requiredConfirmations()} confirmations` };
  await recordPayment(quote, log);
  return { status: "confirmed", txHash: log.transactionHash, blockNumber: log.blockNumber };
}

/** Scheduler path: scan the chain for purchases of every quote awaiting payment. */
export async function pollAwaitingPayments(): Promise<number> {
  const settled = await pollTreasuryTransfers();
  const contract = paymentContractAddress();
  if (!contract) return settled;
  const awaiting = await db()
    .select()
    .from(schema.quotes)
    .where(inArray(schema.quotes.status, ["ACTIVE", "EXPIRED"]));
  // EXPIRED quotes are included for a grace period: a tx mined seconds after expiry
  // is still honoured by the contract (block.timestamp vs expiresAt), so we must honour it too.
  const now = serverNow();
  const candidates = awaiting.filter((q) => q.status === "ACTIVE" || now.getTime() - q.expiresAt.getTime() < 10 * 60 * 1000);
  if (!candidates.length) return 0;

  const client = publicClient();
  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch {
    return 0;
  }
  const deployBlock = BigInt(env().AIRTIME_PAYMENT_CONTRACT_DEPLOY_BLOCK);
  const minIssued = candidates.reduce<bigint | null>((acc, q) => (q.issuedAtBlock !== null && (acc === null || q.issuedAtBlock < acc) ? q.issuedAtBlock : acc), null);
  let fromBlock = minIssued !== null ? minIssued : latest > 5000n ? latest - 5000n : 0n;
  if (fromBlock < deployBlock) fromBlock = deployBlock;
  if (fromBlock > latest) fromBlock = latest;

  let logs: Log[];
  try {
    logs = await client.getLogs({
      address: contract,
      event: PURCHASED_EVENT,
      fromBlock,
      toBlock: latest,
    });
  } catch (err) {
    console.warn("[payments] getLogs failed", (err as Error).message);
    return 0;
  }
  const purchased = extractPurchased(logs);
  let confirmed = 0;
  for (const log of purchased) {
    const quote = candidates.find((q) => q.id.toLowerCase() === log.args.quoteId?.toLowerCase());
    if (!quote) continue;
    if (matches(log, quote, contract)) continue;
    if (Number(latest - log.blockNumber) + 1 < requiredConfirmations()) continue;
    await recordPayment(quote, log);
    confirmed++;
  }
  return confirmed;
}

/**
 * Treasury transfers awaiting confirmation.
 *
 * A transfer has no event to scan for, so the quote's stored hint is what the
 * scheduler follows up. Everything else is identical: the transaction is read
 * from the chain's own RPC and every field re-checked before anything is paid.
 */
async function pollTreasuryTransfers(): Promise<number> {
  const now = serverNow();
  const rows = await db()
    .select()
    .from(schema.quotes)
    .where(inArray(schema.quotes.status, ["ACTIVE", "EXPIRED"]));
  const candidates = rows.filter(
    (q) => q.txHint && isTreasuryQuote(q) && (q.status === "ACTIVE" || now.getTime() - q.expiresAt.getTime() < 10 * 60 * 1000),
  );
  let confirmed = 0;
  for (const quote of candidates) {
    try {
      const outcome = await verifyTreasuryTransfer(quote, quote.txHint as Hex);
      if (outcome.status === "confirmed") {
        await recordPayment(quote, { transactionHash: outcome.txHash, blockNumber: outcome.blockNumber, logIndex: 0 });
        confirmed += 1;
      }
    } catch {
      // An RPC hiccup must not stop the tick; the next one tries again.
    }
  }
  return confirmed;
}
