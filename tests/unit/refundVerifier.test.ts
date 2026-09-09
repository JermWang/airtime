import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { transferMismatch } from "@/server/chain/treasuryTransfer";
import { MEMO_PROGRAM } from "@/lib/chain/solana";
const buyer = Keypair.generate().publicKey.toBase58();
const treasury = Keypair.generate().publicKey.toBase58();
const memo = "AIRTIME:REFUND:payment-id";
function fixture(): ParsedTransactionWithMeta {
 return { slot: 100, meta: { err: null, innerInstructions: [] }, transaction: { message: { accountKeys: [{ pubkey: new PublicKey(treasury), signer: true }], instructions: [
 { programId: new PublicKey("11111111111111111111111111111111"), parsed: { type: "transfer", info: { source: treasury, destination: buyer, lamports: 10000000 } } },
 { programId: new PublicKey(MEMO_PROGRAM), parsed: memo },
 ] } } } as unknown as ParsedTransactionWithMeta;
}
describe("Solana payment and refund matching", () => {
 it("matches an exact native transfer and payment-specific memo", () => { expect(transferMismatch(fixture(), treasury, buyer, "10000000", memo)).toBeNull(); });
 it("rejects a failed transaction", () => { const tx=fixture(); tx.meta!.err={InstructionError:[0,"InvalidArgument"]}; expect(transferMismatch(tx,treasury,buyer,"10000000",memo)).toMatch(/failed/); });
 it("rejects a different wallet, amount or memo", () => {
  expect(transferMismatch(fixture(),buyer,treasury,"10000000",memo)).toMatch(/buyer/);
  expect(transferMismatch(fixture(),treasury,buyer,"10000001",memo)).toMatch(/amount/);
  expect(transferMismatch(fixture(),treasury,buyer,"10000000","AIRTIME:REFUND:other")).toMatch(/memo/);
 });
 it("rejects additional instructions even when the first transfer matches", () => { const tx=fixture(); tx.transaction.message.instructions.push(tx.transaction.message.instructions[0]); expect(transferMismatch(tx,treasury,buyer,"10000000",memo)).toMatch(/unexpected/); });
 it("rejects a fake transfer instruction from another program", () => { const tx=fixture(); tx.transaction.message.instructions[0].programId=new PublicKey(MEMO_PROGRAM); expect(transferMismatch(tx,treasury,buyer,"10000000",memo)).toMatch(/native/); });
});
