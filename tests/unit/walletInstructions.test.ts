import { expect, it } from "vitest";
import { ComputeBudgetProgram, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { LIGHTHOUSE_PROGRAM, paymentInstructions } from "@/lib/chain/walletInstructions";

it.each([0,1,16,17,255])("rejects Lighthouse write/CPI/unknown variant %s",tag=>{
 expect(()=>paymentInstructions([new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[],data:Buffer.from([tag,0])})])).toThrow();
});
it("rejects duplicate compute limits and excessive priority fees",()=>{
 const limit=ComputeBudgetProgram.setComputeUnitLimit({units:1_400_000});
 expect(()=>paymentInstructions([limit,limit])).toThrow();
 expect(()=>paymentInstructions([limit,ComputeBudgetProgram.setComputeUnitPrice({microLamports:1_000_000})])).toThrow(/priority fee/);
});
