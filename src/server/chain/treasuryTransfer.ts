import { PublicKey, type ParsedTransactionWithMeta, type ParsedInstruction } from "@solana/web3.js";
import { NATIVE_TOKEN, isPaymentChain } from "@/lib/chain/chains";
import { MEMO_PROGRAM, isSolanaAddress, isSolanaSignature, quoteMemo } from "@/lib/chain/solana";
import { assertConfiguredCluster } from "./client";
import { clientFor } from "./clients";
import { env } from "../env";
import type { Quote } from "../db/schema";
export type TransferOutcome = { status: "confirmed"; txHash: string; blockNumber: bigint } | { status: "pending"; reason: string } | { status: "not_found" } | { status: "mismatch"; reason: string };
export function treasuryAddress(): string {
 const address = env().SOLANA_TREASURY_ADDRESS;
 return isSolanaAddress(address) ? new PublicKey(address).toBase58() : "";
}
export const memoFor = (quote: Pick<Quote, "id">): string => quoteMemo(quote.id);
/** Only the exact native transfer + memo transaction built by AIRTIME is accepted. */
export function transferMismatch(tx: ParsedTransactionWithMeta, buyer: string, treasury: string, amount: string, memo: string): string | null {
 if (!tx.meta || tx.meta.err) return "transaction failed";
 const keys = tx.transaction.message.accountKeys;
 if (keys[0]?.pubkey.toBase58() !== buyer || !keys[0].signer) return "buyer must be the fee payer and signer";
 const instructions = tx.transaction.message.instructions;
 if (instructions.length !== 2 || tx.meta.innerInstructions?.some((group) => group.instructions.length)) return "unexpected transaction instructions";
 const transfer = instructions[0] as ParsedInstruction;
 if (transfer.programId.toBase58() !== "11111111111111111111111111111111" || transfer.parsed?.type !== "transfer") return "expected a native SOL transfer";
 const info = transfer.parsed.info;
 if (info.source !== buyer || info.destination !== treasury) return "transfer wallet or treasury mismatch";
 if (!Number.isSafeInteger(info.lamports) || BigInt(info.lamports) !== BigInt(amount)) return "amount does not match the quote";
 const note = instructions[1] as ParsedInstruction;
 if (note.programId.toBase58() !== MEMO_PROGRAM || note.parsed !== memo) return "quote memo mismatch";
 return null;
}
export async function verifyTreasuryTransfer(quote: Quote, signature: string): Promise<TransferOutcome> {
 if (!isPaymentChain(quote.chainId) || quote.paymentToken !== NATIVE_TOKEN) return { status: "mismatch", reason: "quote belongs to another network or asset" };
 if (quote.txHint !== signature) return { status: "mismatch", reason: "This signature was not submitted for the quote" };
 if (!isSolanaSignature(signature)) return { status: "mismatch", reason: "invalid Solana signature" };
 await assertConfiguredCluster();
 const tx = await clientFor(quote.chainId).getParsedTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
 if (!tx) return { status: "pending", reason: "Waiting for Solana finality" };
 const mismatch = transferMismatch(tx, quote.walletAddress, quote.contractAddress, quote.amountWei, memoFor(quote));
 if (mismatch) return { status: "mismatch", reason: mismatch };
 if (quote.issuedAtBlock !== null && BigInt(tx.slot) < quote.issuedAtBlock) return { status: "mismatch", reason: "transaction predates the quote" };
 return { status: "confirmed", txHash: signature, blockNumber: BigInt(tx.slot) };
}
