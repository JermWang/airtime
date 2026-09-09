import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";
import { serverNow } from "../time/clock";
import { verifyTreasuryTransfer } from "./treasuryTransfer";
import { publicClient } from "./client";
import { isPaymentChain } from "@/lib/chain/chains";
import { publish } from "../realtime/bus";
import { audit, SYSTEM } from "../audit";
import { takeSurface } from "../ads/activation";
import type { Quote } from "../db/schema";
export type VerifyOutcome = Awaited<ReturnType<typeof verifyTreasuryTransfer>>;
interface PaymentRef { transactionHash: string; blockNumber: bigint; logIndex: number }
async function recordPayment(quote: Quote, log: PaymentRef): Promise<void> {
  const now = serverNow();
  const guaranteedUntil = new Date(now.getTime() + quote.endsAt.getTime() - quote.startsAt.getTime());
  await db().transaction(async (tx) => {
    // Lock the surface before the campaign: takeSurface decides here whether this
    // payment displaces whoever is currently running.
    const [placement] = await tx.select().from(schema.placements).where(eq(schema.placements.id, quote.placementId)).for("update");
    // Another verifier may have committed while this request waited for the
    // surface. Check idempotency only after acquiring the shared lock.
    const [existing] = await tx.select().from(schema.payments).where(eq(schema.payments.quoteId, quote.id));
    if (existing) return;
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

    const [creative] = campaign.creativeId ? await tx.select().from(schema.creatives).where(eq(schema.creatives.id, campaign.creativeId)) : [];
    if (!["AWAITING_PAYMENT", "READY_TO_PURCHASE"].includes(campaign.status) || !creative || creative.creativeHash !== quote.creativeHash || !["VALID", "APPROVED"].includes(creative.status) || !placement.isActive) {
      await tx.update(schema.campaigns).set({ status: "REJECTED", paymentId: payment.id, paidPriceWei: quote.amountWei, rejectionReason: "Payment arrived after this campaign changed or became unavailable. Refund required.", updatedAt: now }).where(eq(schema.campaigns.id, campaign.id));
      await tx.update(schema.reservations).set({ status: "RELEASED" }).where(eq(schema.reservations.quoteId, quote.id));
      await audit(SYSTEM, "payment.refund_required", { type: "campaign", id: campaign.id }, { paymentId: payment.id }, tx);
      return;
    }
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
      .set({ status: "PAID", paymentId: payment.id, paidPriceWei: quote.amountWei, guaranteedUntil, activeQuoteId: null, updatedAt: now })
      .where(eq(schema.campaigns.id, campaign.id));
    await audit(SYSTEM, "payment.confirmed", { type: "campaign", id: campaign.id }, { txHash: log.transactionHash, blockNumber: log.blockNumber.toString(), amountWei: quote.amountWei }, tx);
    publish({ type: "payment.confirmed", campaignId: campaign.id, txHash: log.transactionHash });

    // Paid: take the surface now, displacing a cheaper occupant if there is one.
    const [paidCampaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
    const result = await takeSurface(tx, { placement, campaign: paidCampaign, amountWei, guaranteedUntil, now });
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


export async function verifyQuoteByTxHash(quoteId: string, signature: string): Promise<VerifyOutcome> {
 const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
 if (!quote) return { status: "not_found" };
 if (!isPaymentChain(quote.chainId)) return { status: "mismatch", reason: "Archived network" };
 if (quote.status === "CONSUMED") {
  const [payment] = await db().select().from(schema.payments).where(eq(schema.payments.quoteId, quoteId));
  return payment ? { status: "confirmed", txHash: payment.txHash, blockNumber: payment.blockNumber } : { status: "not_found" };
 }
 const outcome = await verifyTreasuryTransfer(quote, signature);
 if (outcome.status === "confirmed") await recordPayment(quote, { transactionHash: signature, blockNumber: outcome.blockNumber, logIndex: 0 });
 return outcome;
}
export async function pollAwaitingPayments(): Promise<number> {
 const rows = await db().select().from(schema.quotes).where(inArray(schema.quotes.status, ["ACTIVE", "EXPIRED", "CANCELLED"]));
 let settled = 0;
 for (const quote of rows.filter(q => q.txHint && !q.txError && isPaymentChain(q.chainId))) {
  try {
   const outcome = await verifyQuoteByTxHash(quote.id, quote.txHint!);
   if (outcome.status === "confirmed") { settled++; continue; }
   if (outcome.status === "mismatch") { await retireSubmission(quote, outcome.reason); continue; }
   if (quote.txPayload && quote.txLastValidBlockHeight !== null) {
    const height = await publicClient().getBlockHeight("finalized");
    if (BigInt(height) > quote.txLastValidBlockHeight) {
     // Recheck after observing expiry: a successful transaction can finalize at the boundary.
     const final = await verifyQuoteByTxHash(quote.id, quote.txHint!);
     if (final.status === "confirmed") { settled++; continue; }
     await retireSubmission(quote, "The transaction expired before it landed. Request a new quote.");
    } else await publicClient().sendRawTransaction(Buffer.from(quote.txPayload, "base64"), { skipPreflight: false, maxRetries: 1 });
   }
  }
  catch { /* Retry transient RPC errors on the next scheduler tick. */ }
 }
 return settled;
}

async function retireSubmission(quote: Quote, reason: string): Promise<void> {
 await db().transaction(async tx => {
  const [locked] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quote.id)).for("update");
  if (locked.status === "CONSUMED") return;
  await tx.update(schema.quotes).set({ status: "CANCELLED", txError: reason, txPayload: null }).where(eq(schema.quotes.id, quote.id));
  await tx.update(schema.reservations).set({ status: "RELEASED" }).where(and(eq(schema.reservations.quoteId, quote.id), eq(schema.reservations.status, "HELD")));
  await tx.update(schema.campaigns).set({ status: "READY_TO_PURCHASE", activeQuoteId: null, updatedAt: serverNow() }).where(and(eq(schema.campaigns.id, quote.campaignId), eq(schema.campaigns.activeQuoteId, quote.id), eq(schema.campaigns.status, "AWAITING_PAYMENT")));
 });
}
