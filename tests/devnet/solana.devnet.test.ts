import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { Keypair, Connection, Transaction, SystemProgram, TransactionInstruction, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import sharp from "sharp";
import { eq } from "drizzle-orm";
const session=vi.hoisted(()=>{
 process.env.NEXT_PUBLIC_SOLANA_NETWORK="devnet";
 process.env.SOLANA_RPC_URL="https://api.devnet.solana.com";
 process.env.SOLANA_TREASURY_ADDRESS="2TMqYRL8XqdgpRRxeeH47pBcBpVTeBLBv1DbhJv74jyT";
 process.env.DATABASE_URL="";process.env.AIRTIME_DB_MEMORY="1";
 return {cookie:""};
});
// Only Next's request-local cookie storage is replaced. RPC, transaction signing,
// database, reservation, settlement, activation and refund code are real.
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:session.cookie})})}));
import { boot } from "@/server/boot";
import { db, schema, closeDb } from "@/server/db/client";
import { createCreativeFromUpload } from "@/server/ads/creatives";
import { createCampaign, adminSetCampaignStatus, getBoard } from "@/server/ads/campaigns";
import { createQuote } from "@/server/ads/quotes";
import { signSession } from "@/server/auth/session";
import { POST as submit } from "@/app/api/campaigns/[id]/transaction/route";
import { verifyQuoteByTxHash } from "@/server/chain/paymentVerifier";
import { verifyRefund } from "@/server/chain/refundVerifier";
import { MEMO_PROGRAM } from "@/lib/chain/solana";
const keys=JSON.parse(readFileSync(".render/solana-devnet-test-wallets.json","utf8"));
const buyer=Keypair.fromSecretKey(Uint8Array.from(keys.buyer));
const treasury=Keypair.fromSecretKey(Uint8Array.from(keys.treasury));
const rpc=new Connection("https://api.devnet.solana.com","finalized");
const report:Record<string,unknown>={network:"devnet",at:new Date().toISOString(),buyer:buyer.publicKey.toBase58(),treasury:treasury.publicKey.toBase58()};
function save(){writeFileSync(".render/solana-funded-devnet-report.json",JSON.stringify(report,null,2));}
const req=(body:unknown)=>new Request("http://localhost:3300/api/campaigns/test/transaction",{method:"POST",headers:{host:"localhost:3300",origin:"http://localhost:3300","content-type":"application/json"},body:JSON.stringify(body)});
async function finalized(signature:string){for(let i=0;i<30;i++){const tx=await rpc.getParsedTransaction(signature,{commitment:"finalized",maxSupportedTransactionVersion:0});if(tx){expect(tx.meta?.err).toBeNull();return tx;}await new Promise(r=>setTimeout(r,4000));}throw Error("Timed out waiting for finality: "+signature);}
async function transfer(from:Keypair,to:PublicKey,amount:number,memo:string|undefined,tag:string){
 const block=await rpc.getLatestBlockhash("finalized");
 const tx=new Transaction({feePayer:from.publicKey,...block}).add(SystemProgram.transfer({fromPubkey:from.publicKey,toPubkey:to,lamports:amount}));
 if(memo)tx.add(new TransactionInstruction({programId:new PublicKey(MEMO_PROGRAM),keys:[{pubkey:from.publicKey,isSigner:true,isWritable:false}],data:Buffer.from(memo)}));
 tx.sign(from);const signature=bs58.encode(tx.signature!);report[tag]=signature;save();
 await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});await finalized(signature);return signature;
}
beforeAll(async()=>{expect(await rpc.getGenesisHash()).toBe("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");expect(treasury.publicKey.toBase58()).toBe(process.env.SOLANA_TREASURY_ADDRESS);expect(await rpc.getBalance(buyer.publicKey)).toBeGreaterThan(5500_000_000);await boot({ticker:false});session.cookie=await signSession({kind:"wallet",address:buyer.publicKey.toBase58(),chainId:901},3600);});
afterAll(async()=>{await closeDb();save();});
it("submits, finalizes, activates and refunds a native SOL payment on real devnet",async()=>{
 // Treasury needs its own fee/rent buffer so it can refund the full price.
 if(await rpc.getBalance(treasury.publicKey)<1_500_000) await transfer(buyer,treasury.publicKey,2_000_000,undefined,"treasuryFundingSignature");
 const bytes=await sharp({create:{width:1280,height:720,channels:3,background:"#69aac1"}}).png().toBuffer();
 const creative=await createCreativeFromUpload({walletAddress:buyer.publicKey.toBase58(),placementId:"PANEL_LEFT",bytes,filename:"test.png"});
 const c=await createCampaign({walletAddress:buyer.publicKey.toBase58(),placementId:"PANEL_LEFT",displayName:"test",creativeId:creative.id});
 const quote=await createQuote({campaignId:c.id,walletAddress:buyer.publicKey.toBase58(),chainId:901,maxPriceWei:500_000_000n});
 expect(quote.amountWei).toBe("500000000");report.campaignId=c.id;report.quoteId=quote.quote.quoteId;
 const context={params:Promise.resolve({id:c.id})};
 const prepared=await submit(req({}),context);expect(prepared.status).toBe(200);
 const tx=Transaction.from(Buffer.from((await prepared.json()).transaction,"base64"));tx.sign(buyer);
 const signature=bs58.encode(tx.signature!);report.paymentSignature=signature;save();
 const submitted=await submit(req({signedTransaction:tx.serialize().toString("base64")}),context);expect(submitted.status).toBe(200);
 expect((await submitted.json()).signature).toBe(signature);
 expect((await submit(req({signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(409);
 await finalized(signature);
 expect((await verifyQuoteByTxHash(quote.quote.quoteId,signature)).status).toBe("confirmed");
 expect((await verifyQuoteByTxHash(quote.quote.quoteId,signature)).status).toBe("confirmed");
 const payments=await db().select().from(schema.payments).where(eq(schema.payments.quoteId,quote.quote.quoteId));expect(payments).toHaveLength(1);
 const [campaign]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,c.id));expect(campaign.status).toBe("AIRING");
 expect((await getBoard("MAIN")).rows.find(r=>r.placement.id==="PANEL_LEFT")?.occupant?.id).toBe(c.id);
 report.paymentConfirmed=true;report.exactlyOnce=true;report.activated=true;save();
 const refund=await transfer(treasury,buyer.publicKey,500_000_000,"AIRTIME:REFUND:"+payments[0].id,"refundSignature");
 expect((await verifyRefund(payments[0],refund)).status).toBe("confirmed");
 await adminSetCampaignStatus(c.id,"REFUNDED",{type:"SYSTEM",id:null},{reason:"devnet test refund",refundTxHash:refund});
 const [payment]=await db().select().from(schema.payments).where(eq(schema.payments.id,payments[0].id));expect(payment.status).toBe("REFUNDED");
 const [refunded]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,c.id));expect(refunded.status).toBe("REFUNDED");
 report.refundConfirmed=true;report.finalStatus="PASS";save();console.log(JSON.stringify(report));
});
