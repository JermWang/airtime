import { parseAbiItem, parseEventLogs, type Hex, type Log } from "viem";
import { NATIVE_TOKEN } from "@/lib/chain/chains";
import type { Payment } from "../db/schema";
import { requiredConfirmations } from "./client";
import { clientFor } from "./clients";
import { treasuryAddress } from "./treasuryTransfer";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

type RefundPayment = Pick<Payment, "chainId" | "buyer" | "paymentToken" | "amountWei">;

export type RefundOutcome =
  | { status: "confirmed"; txHash: Hex; blockNumber: bigint; logIndex: number }
  | { status: "pending"; reason: string }
  | { status: "not_found" }
  | { status: "mismatch"; reason: string };

export function nativeRefundMismatch(
  payment: RefundPayment,
  tx: { from: string; to: string | null; value: bigint },
): string | null {
  if (tx.from.toLowerCase() !== treasuryAddress().toLowerCase()) return "transaction was not sent by the AIRTIME treasury";
  if ((tx.to ?? "").toLowerCase() !== payment.buyer.toLowerCase()) return "transaction was not sent to the original buyer";
  if (tx.value !== BigInt(payment.amountWei)) return "refund amount does not match the original payment";
  return null;
}

export function matchingTokenRefundLog(payment: RefundPayment, logs: Log[]): number | null {
  const parsed = parseEventLogs({ abi: [TRANSFER_EVENT], eventName: "Transfer", logs, strict: true });
  const match = parsed.find(
    (log) =>
      log.address.toLowerCase() === payment.paymentToken.toLowerCase() &&
      log.args.from?.toLowerCase() === treasuryAddress().toLowerCase() &&
      log.args.to?.toLowerCase() === payment.buyer.toLowerCase() &&
      log.args.value === BigInt(payment.amountWei),
  );
  return match?.logIndex ?? null;
}

/**
 * A campaign is only recorded as refunded after the server reads a successful,
 * confirmed treasury-to-buyer transfer from the RPC for the original chain.
 * The operator supplies only the transaction hash; all meaningful fields are
 * derived and checked independently.
 */
export async function verifyRefund(payment: RefundPayment, txHash: Hex): Promise<RefundOutcome> {
  const client = clientFor(payment.chainId);
  const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
  if (!tx) return { status: "not_found" };
  if (tx.blockNumber === null || tx.blockNumber === undefined) return { status: "pending", reason: "transaction is not mined yet" };

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return { status: "pending", reason: "receipt is not available yet" };
  if (receipt.status !== "success") return { status: "mismatch", reason: "transaction reverted" };

  let logIndex = 0;
  if (payment.paymentToken.toLowerCase() === NATIVE_TOKEN) {
    const mismatch = nativeRefundMismatch(payment, tx);
    if (mismatch) return { status: "mismatch", reason: mismatch };
  } else {
    const matched = matchingTokenRefundLog(payment, receipt.logs);
    if (matched === null) return { status: "mismatch", reason: "no matching treasury-to-buyer token transfer was found" };
    logIndex = matched;
  }

  const head = await client.getBlockNumber();
  const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;
  if (confirmations < BigInt(requiredConfirmations())) {
    return { status: "pending", reason: `${confirmations}/${requiredConfirmations()} confirmations` };
  }
  return { status: "confirmed", txHash, blockNumber: receipt.blockNumber, logIndex };
}
