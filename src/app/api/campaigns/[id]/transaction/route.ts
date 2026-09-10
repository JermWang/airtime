import { z } from "zod";
import bs58 from "bs58";
import { PublicKey, SystemProgram, SystemInstruction, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin, HttpError } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { publicClient, assertConfiguredCluster } from "@/server/chain/client";
import { MEMO_PROGRAM, quoteMemo } from "@/lib/chain/solana";
import { isPaymentChain } from "@/lib/chain/chains";
import { serverNow } from "@/server/time/clock";
import { paymentInstructions } from "@/lib/chain/walletInstructions";
export const dynamic = "force-dynamic";
const body = z.object({ signedTransaction: z.string().max(1800).optional() });
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
 assertSameOrigin(req); const wallet = await requireWallet(); const { id } = await params;
 const input = await parseBody(req, body);
 const [campaign] = await db().select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
 if (!campaign || campaign.walletAddress !== wallet.address) throw new HttpError(404, "Campaign not found");
 if (!campaign.activeQuoteId) throw new HttpError(409, "Request a new quote");
 const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, campaign.activeQuoteId));
 if (!quote || quote.status !== "ACTIVE" || quote.expiresAt <= serverNow() || !isPaymentChain(quote.chainId)) throw new HttpError(409, "Quote expired. Request a new quote.");
 if (quote.txHint) throw new HttpError(409, "A payment was already submitted. Wait for confirmation before trying again.");
 const memo = quoteMemo(quote.id); const buyer = new PublicKey(wallet.address);
 await assertConfiguredCluster();
 const connection = publicClient();
 if (!input.signedTransaction) {
  const latest = await connection.getLatestBlockhash("finalized");
  await db().update(schema.quotes).set({ txBlockhash: latest.blockhash, txLastValidBlockHeight: BigInt(latest.lastValidBlockHeight) }).where(eq(schema.quotes.id, quote.id));
  const tx = new Transaction({ feePayer: buyer, ...latest }).add(
   SystemProgram.transfer({ fromPubkey: buyer, toPubkey: new PublicKey(quote.contractAddress), lamports: BigInt(quote.amountWei) }),
   new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM), keys: [{ pubkey: buyer, isSigner: true, isWritable: false }], data: Buffer.from(memo) }),
  );
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  let simulation;
  try {
   simulation = await connection.simulateTransaction(VersionedTransaction.deserialize(serialized), { sigVerify: false, commitment: "confirmed" });
  } catch {
   throw new HttpError(503, "Solana could not preview this payment. Try again shortly; no payment was sent.");
  }
  if (simulation.value.err) throw new HttpError(400, "This payment cannot complete on Solana. Check that your wallet has enough SOL for the price and network fee, then try again. No payment was sent.");
  return json({ transaction: serialized.toString("base64") });
 }
 let signed: Transaction;
 try { signed = Transaction.from(Buffer.from(input.signedTransaction, "base64")); } catch { throw new HttpError(400, "Invalid transaction"); }
 if (signed.recentBlockhash !== quote.txBlockhash) throw new HttpError(400, "The wallet returned a different transaction blockhash. No payment was sent. Request a fresh quote.");
 if (!signed.verifySignatures() || !signed.feePayer?.equals(buyer) || signed.signatures.length !== 1) throw new HttpError(400, "The wallet signature or fee payer does not match this purchase. No payment was sent.");
 let payment: TransactionInstruction[];
 try { payment = paymentInstructions(signed.instructions); }
 catch (error) { throw new HttpError(400, `${(error as Error).message}. No payment was sent.`); }
 if (payment.length !== 2) throw new HttpError(400, "Unexpected payment instructions. No payment was sent.");
 const [transfer, note] = payment;
 try {
  const decoded = SystemInstruction.decodeTransfer(transfer);
  if (!decoded.fromPubkey.equals(buyer) || decoded.toPubkey.toBase58() !== quote.contractAddress || BigInt(decoded.lamports) !== BigInt(quote.amountWei)) throw new Error("mismatch");
  if (!note.programId.equals(new PublicKey(MEMO_PROGRAM)) || note.data.toString() !== memo || note.keys.length !== 1 || !note.keys[0].pubkey.equals(buyer) || !note.keys[0].isSigner) throw new Error("memo");
 } catch { throw new HttpError(400, "Transaction does not match the quote"); }
 const signature = bs58.encode(signed.signature!);
 // Persist BEFORE submission: the scheduler recovers even when the browser closes.
 const accepted = await db().transaction(async (tx) => {
  const [locked] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quote.id)).for("update");
  if (locked.txBlockhash !== signed.recentBlockhash || locked.txHint || locked.status !== "ACTIVE" || locked.expiresAt <= serverNow()) return false;
  await tx.update(schema.quotes).set({ txHint: signature, txPayload: input.signedTransaction! }).where(eq(schema.quotes.id, quote.id)); return true;
 });
 if (!accepted) throw new HttpError(409, "Quote has already been submitted or expired");
 try { await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 }); }
 catch { return json({ signature, pending: true }); }
 return json({ signature, pending: true });
});
