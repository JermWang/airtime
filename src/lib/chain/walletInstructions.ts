import { ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";

// Phantom's documented Lighthouse deployment. Only assertion instructions are
// accepted; memory writes/closes and CPI-capable Merkle proofs are excluded.
export const LIGHTHOUSE_PROGRAM = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
export const MAX_PRIORITY_FEE_LAMPORTS = 500_000n;

/** Strip validated wallet metadata, retaining the original payment order. */
export function paymentInstructions(instructions: TransactionInstruction[]): TransactionInstruction[] {
  const payment: TransactionInstruction[] = [];
  let limit = 1_400_000;
  let price = 0n;
  const seen = new Set<number>();
  for (const ix of instructions) {
    const program = ix.programId.toBase58();
    if (program === ComputeBudgetProgram.programId.toBase58()) {
      const tag = ix.data[0];
      if (ix.keys.length || seen.has(tag)) throw new Error("Unexpected compute-budget instruction");
      seen.add(tag);
      if (tag === 2 && ix.data.length === 5) {
        limit = ix.data.readUInt32LE(1);
        if (limit < 1 || limit > 1_400_000) throw new Error("Invalid compute limit");
      } else if (tag === 3 && ix.data.length === 9) price = ix.data.readBigUInt64LE(1);
      else throw new Error("Unsupported compute-budget instruction");
    } else if (program === LIGHTHOUSE_PROGRAM) {
      // Borsh enum variants 2..15 are read-only assertions in Lighthouse.
      if (ix.data.length < 2 || ix.data[0] < 2 || ix.data[0] > 15) throw new Error("Unsupported Lighthouse instruction");
    } else payment.push(ix);
  }
  if ((BigInt(limit) * price + 999_999n) / 1_000_000n > MAX_PRIORITY_FEE_LAMPORTS) throw new Error("Wallet priority fee exceeds the payment limit");
  return payment;
}
