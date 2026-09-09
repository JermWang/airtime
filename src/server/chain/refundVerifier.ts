import type { Payment } from "../db/schema";
import { NATIVE_TOKEN, isPaymentChain } from "@/lib/chain/chains";
import { isSolanaSignature } from "@/lib/chain/solana";
import { assertConfiguredCluster } from "./client";
import { clientFor } from "./clients";
import { treasuryAddress, transferMismatch, type TransferOutcome } from "./treasuryTransfer";
type RefundPayment = Pick<Payment, "id" | "chainId" | "buyer" | "paymentToken" | "amountWei" | "confirmedAt">;
export type RefundOutcome = Exclude<TransferOutcome, { status: "confirmed" }> | { status: "confirmed"; txHash: string; blockNumber: bigint; logIndex: number };
/** Refunds carry a payment-specific memo, preventing reuse across equal purchases. */
export async function verifyRefund(payment: RefundPayment, signature: string): Promise<RefundOutcome> {
 if (!isPaymentChain(payment.chainId) || payment.paymentToken !== NATIVE_TOKEN || !isSolanaSignature(signature)) return { status: "mismatch", reason: "Invalid Solana refund" };
 await assertConfiguredCluster();
 const tx = await clientFor(payment.chainId).getParsedTransaction(signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
 if (!tx) return { status: "pending", reason: "Waiting for finalized refund" };
 const mismatch = transferMismatch(tx, treasuryAddress(), payment.buyer, payment.amountWei, `AIRTIME:REFUND:${payment.id}`);
 if (mismatch) return { status: "mismatch", reason: mismatch };
 if (payment.confirmedAt && (!tx.blockTime || tx.blockTime * 1000 < payment.confirmedAt.getTime() - 1000)) return { status: "mismatch", reason: "refund predates payment" };
 return { status: "confirmed", txHash: signature, blockNumber: BigInt(tx.slot), logIndex: 0 };
}
