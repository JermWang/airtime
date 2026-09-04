import { getAddress, type Hex } from "viem";
import { TREASURY_ADDRESS } from "@/lib/chain/treasury";
import { NATIVE_TOKEN } from "@/lib/chain/chains";
import { clientFor } from "./clients";
import { requiredConfirmations } from "./client";
import type { Quote } from "../db/schema";

/**
 * Treasury-transfer payments.
 *
 * When no payment contract is deployed on the chain a buyer chose, the quote is
 * settled by a plain native transfer into the AIRTIME treasury. The browser
 * still decides nothing: it may hint a transaction hash, and the server then
 * reads that transaction from its own RPC for that chain and checks
 *
 *   - it is mined, successful, and has enough confirmations
 *   - it was sent by the wallet the quote was issued to
 *   - it went to the treasury address this deployment is configured with
 *   - its value is exactly the quoted amount
 *   - its calldata carries the quote id, which is what binds an otherwise
 *     ordinary transfer to this specific quote and stops an unrelated payment
 *     (or the same payment twice) being claimed for airtime
 *
 * A transfer without the quote id in its calldata is not accepted, so a buyer
 * cannot point at somebody else's transaction.
 */

export type TransferOutcome =
  | { status: "confirmed"; txHash: Hex; blockNumber: bigint }
  | { status: "pending"; reason: string }
  | { status: "not_found" }
  | { status: "mismatch"; reason: string };

export function treasuryAddress(): `0x${string}` {
  return getAddress(TREASURY_ADDRESS);
}

/** The calldata a buyer must attach: the 32-byte quote id, nothing else. */
export function memoFor(quote: Pick<Quote, "id">): Hex {
  return quote.id as Hex;
}

function carriesQuoteId(input: string, quoteId: string): boolean {
  const needle = quoteId.toLowerCase().replace(/^0x/, "");
  return input.toLowerCase().includes(needle);
}

export async function verifyTreasuryTransfer(quote: Quote, txHash: Hex): Promise<TransferOutcome> {
  const client = clientFor(quote.chainId);

  const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
  if (!tx) return { status: "not_found" };
  if (tx.blockNumber === null || tx.blockNumber === undefined) return { status: "pending", reason: "transaction is not mined yet" };

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return { status: "pending", reason: "receipt is not available yet" };
  if (receipt.status !== "success") return { status: "mismatch", reason: "transaction reverted" };

  if (quote.paymentToken.toLowerCase() !== NATIVE_TOKEN) {
    return { status: "mismatch", reason: "only native transfers are accepted without a payment contract" };
  }
  if ((tx.from ?? "").toLowerCase() !== quote.walletAddress.toLowerCase()) {
    return { status: "mismatch", reason: "sent by a different wallet than the quote was issued to" };
  }
  if ((tx.to ?? "").toLowerCase() !== treasuryAddress().toLowerCase()) {
    return { status: "mismatch", reason: "not sent to the AIRTIME treasury" };
  }
  if (tx.value !== BigInt(quote.amountWei)) {
    return { status: "mismatch", reason: "amount does not match the quote" };
  }
  if (!carriesQuoteId(tx.input ?? "0x", quote.id)) {
    return { status: "mismatch", reason: "transaction does not carry this quote id" };
  }

  const head = await client.getBlockNumber();
  const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;
  if (confirmations < BigInt(requiredConfirmations())) {
    return { status: "pending", reason: `waiting for ${requiredConfirmations()} confirmations` };
  }

  return { status: "confirmed", txHash, blockNumber: receipt.blockNumber };
}
