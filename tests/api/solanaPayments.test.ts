import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, SystemProgram, SystemInstruction, PublicKey } from "@solana/web3.js";
import { LIGHTHOUSE_PROGRAM } from "@/lib/chain/walletInstructions";
import bs58 from "bs58";
import nacl from "tweetnacl";
import sharp from "sharp";
import { eq } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ cookie: "", send: vi.fn(), parsed: vi.fn(), height: vi.fn(), simulate: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({value:mocks.cookie}), set: (_: string, value: string) => { mocks.cookie=value; } }) }));
vi.mock("@/server/chain/client", () => ({
 publicClient: () => ({ simulateTransaction:mocks.simulate, getSlot: async () => 100, getLatestBlockhash: async () => ({ blockhash:"11111111111111111111111111111111", lastValidBlockHeight:1000 }), sendRawTransaction:mocks.send, getParsedTransaction:mocks.parsed, getBlockHeight:mocks.height }),
 assertConfiguredCluster: async () => {}, serverRpcUrl: () => "mock", resetPublicClientForTests: () => {},
}));
import { boot } from "@/server/boot";
import { db, schema, closeDb } from "@/server/db/client";
import { createCreativeFromUpload } from "@/server/ads/creatives";
import { createCampaign, updateCampaignDraft } from "@/server/ads/campaigns";
import { createQuote, expireQuotes } from "@/server/ads/quotes";
import { signSession } from "@/server/auth/session";
import { signInMessage } from "@/lib/chain/solana";
import { POST as submit } from "@/app/api/campaigns/[id]/transaction/route";
import { GET as resumeQuote, DELETE as releaseQuote } from "@/app/api/campaigns/[id]/quote/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { pollAwaitingPayments } from "@/server/chain/paymentVerifier";
import { MEMO_PROGRAM, quoteMemo } from "@/lib/chain/solana";
const buyer=Keypair.generate();
const origin="http://localhost:3200";
function request(path:string, body:unknown) { return new Request(origin+path,{method:"POST",headers:{"content-type":"application/json",origin,host:"localhost:3200"},body:JSON.stringify(body)}); }
beforeAll(async () => { await boot({ticker:false}); });
beforeEach(async () => {
 await db().update(schema.campaigns).set({status:"COMPLETED",guaranteedUntil:null}).where(eq(schema.campaigns.status,"AIRING"));
 await db().update(schema.placements).set({currentCampaignId:null,lastClearingPriceWei:"0"});
 await db().update(schema.adActivations).set({status:"ENDED",endedAt:new Date()});
 await db().update(schema.reservations).set({status:"RELEASED"});
 mocks.simulate.mockReset().mockResolvedValue({value:{err:null}});
 mocks.send.mockReset(); mocks.parsed.mockReset().mockResolvedValue(null); mocks.height.mockReset().mockResolvedValue(500);
 await db().update(schema.quotes).set({txError:"previous test complete"});
 mocks.cookie=await signSession({kind:"wallet",address:buyer.publicKey.toBase58(),chainId:902},3600);
 await db().update(schema.reservations).set({status:"RELEASED"}).where(eq(schema.reservations.status,"HELD"));
 await db().update(schema.quotes).set({status:"CANCELLED"}).where(eq(schema.quotes.status,"ACTIVE"));
});
afterAll(async () => { await closeDb(); });
async function order() {
 const bytes=await sharp({create:{width:1280,height:720,channels:3,background:"#d5ff00"}}).png().toBuffer();
 const creative=await createCreativeFromUpload({walletAddress:buyer.publicKey.toBase58(),placementId:"PANEL_LEFT",bytes,filename:"ad.png"});
 const c=await createCampaign({walletAddress:buyer.publicKey.toBase58(),placementId:"PANEL_LEFT",displayName:"test",creativeId:creative.id});
 const quote=await createQuote({campaignId:c.id,walletAddress:buyer.publicKey.toBase58()});
 const context={params:Promise.resolve({id:c.id})};
 const prepared=await submit(request("/api/campaigns/"+c.id+"/transaction",{}),context);
 expect(prepared.status).toBe(200);
 const tx=Transaction.from(Buffer.from((await prepared.json()).transaction,"base64"));
 return {tx,quote,context,id:c.id};
}
it("persists the signature before broadcasting and refuses duplicate submission",async()=>{
 const {tx,quote,context,id}=await order();tx.sign(buyer);
 const signature=bs58.encode(tx.signature!);
 mocks.send.mockImplementation(async()=>{
  const [stored]=await db().select().from(schema.quotes).where(eq(schema.quotes.id,quote.quote.quoteId));
  expect(stored.txHint).toBe(signature); return signature;
 });
 const body={signedTransaction:tx.serialize().toString("base64")};
 expect((await submit(request("/api/campaigns/"+id+"/transaction",body),context)).status).toBe(200);
 expect((await submit(request("/api/campaigns/"+id+"/transaction",body),context)).status).toBe(409);
 expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("persists reviewed ad text, destination and framing before payment",async()=>{
 const {id,context}=await order();
 expect((await releaseQuote(request(`/api/campaigns/${id}/quote`,{}),context)).status).toBe(200);
 const updated=await updateCampaignDraft(id,buyer.publicKey.toBase58(),{displayName:"AIRTIME mainnet verified",clickUrl:"https://airtime.media/",fit:"FIT"});
 expect(updated).toMatchObject({displayName:"AIRTIME mainnet verified",clickUrl:"https://airtime.media/",fit:"FIT"});
 await expect(updateCampaignDraft(id,buyer.publicKey.toBase58(),{clickUrl:"javascript:alert(1)"})).rejects.toThrow(/HTTPS/);
});
it("accepts Phantom guards and priority fees, then activates the ad exactly once",async()=>{
 const {tx,quote,context,id}=await order();
 const original=[...tx.instructions];
 const guard=new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:buyer.publicKey,isSigner:false,isWritable:false}],data:Buffer.from([5,0])});
 tx.instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:100_000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),guard,...original,guard];
 tx.sign(buyer);
 expect((await submit(request(`/api/campaigns/${id}/transaction`,{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(200);
 const transfer=SystemInstruction.decodeTransfer(original[0]);
 mocks.parsed.mockResolvedValue({slot:101,meta:{err:null,innerInstructions:[]},transaction:{message:{accountKeys:[{pubkey:buyer.publicKey,signer:true}],instructions:tx.instructions.map(ix=>ix===original[0]?{programId:SystemProgram.programId,parsed:{type:"transfer",info:{source:buyer.publicKey.toBase58(),destination:transfer.toPubkey.toBase58(),lamports:Number(transfer.lamports)}}}:ix===original[1]?{programId:new PublicKey(MEMO_PROGRAM),parsed:quoteMemo(quote.quote.quoteId)}:{programId:ix.programId,accounts:ix.keys.map(k=>k.pubkey),data:bs58.encode(ix.data)})}}});
 expect(await pollAwaitingPayments()).toBe(1);
 expect(await pollAwaitingPayments()).toBe(0);
 const [campaign]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,id));
 expect(campaign.status).toBe("AIRING");
 expect(await db().select().from(schema.payments).where(eq(schema.payments.quoteId,quote.quote.quoteId))).toHaveLength(1);
});
it.each(["extra transfer","changed amount","memory write","unknown program"])("still rejects %s alongside wallet guards",async kind=>{
 const {tx,context,id}=await order();
 if(kind==="changed amount")tx.instructions[0]=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:SystemInstruction.decodeTransfer(tx.instructions[0]).toPubkey,lamports:1});
 else if(kind==="extra transfer")tx.add(SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));
 else tx.add(new TransactionInstruction({programId:kind==="memory write"?new PublicKey(LIGHTHOUSE_PROGRAM):Keypair.generate().publicKey,keys:[],data:Buffer.from([0,0])}));
 tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:100_000}));tx.sign(buyer);
 expect((await submit(request(`/api/campaigns/${id}/transaction`,{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(400);
 expect(mocks.send).not.toHaveBeenCalled();
});
it("resumes the same quote and identifies submitted payments without broadcasting twice",async()=>{
 const {tx,quote,context,id}=await order();
 const req=new Request(origin+`/api/campaigns/${id}/quote`);
 const before=await resumeQuote(req,context);
 expect(before.status).toBe(200);
 expect(await before.json()).toMatchObject({campaignId:id,amountWei:quote.amountWei,paymentSubmitted:false,quote:{quoteId:quote.quote.quoteId}});
 tx.sign(buyer);
 expect((await submit(request(`/api/campaigns/${id}/transaction`,{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(200);
 const after=await resumeQuote(req,context);
 expect(await after.json()).toMatchObject({paymentSubmitted:true});
 expect((await releaseQuote(request(`/api/campaigns/${id}/quote`,{}),context)).status).toBe(409);
 mocks.cookie=await signSession({kind:"wallet",address:Keypair.generate().publicKey.toBase58(),chainId:902},3600);
 expect((await resumeQuote(req,context)).status).toBe(404);
 expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("rejects a signed transaction whose destination was changed",async()=>{
 const {tx,context,id}=await order();
 tx.instructions[0]=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:10000000});
 tx.sign(buyer);
 expect((await submit(request("/api/campaigns/"+id+"/transaction",{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(400);
 expect(mocks.send).not.toHaveBeenCalled();
});
it("does not submit an expired reservation",async()=>{
 const {tx,quote,context,id}=await order();tx.sign(buyer);
 await db().update(schema.quotes).set({expiresAt:new Date(0)}).where(eq(schema.quotes.id,quote.quote.quoteId));
 expect((await submit(request("/api/campaigns/"+id+"/transaction",{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(409);
 expect(mocks.send).not.toHaveBeenCalled();
});
it("validates Solana login and consumes each nonce exactly once",async()=>{
 const nonce="ab".repeat(24);
 await db().insert(schema.authNonces).values({nonce,expiresAt:new Date(Date.now()+60000)});
 const fields={address:buyer.publicKey.toBase58(),origin,nonce,chainId:902};
 const signature=bs58.encode(nacl.sign.detached(new TextEncoder().encode(signInMessage(fields)),buyer.secretKey));
 const body={...fields,signature};
 expect((await verify(request("/api/auth/verify",body),undefined)).status).toBe(200);
 expect((await verify(request("/api/auth/verify",body),undefined)).status).toBe(400);
});
it("rejects another site's sign-in and wrong-wallet signatures",async()=>{
 const nonce="cd".repeat(24);
 await db().insert(schema.authNonces).values({nonce,expiresAt:new Date(Date.now()+60000)});
 const fields={address:buyer.publicKey.toBase58(),origin,nonce,chainId:902};
 const signature=bs58.encode(nacl.sign.detached(new TextEncoder().encode(signInMessage(fields)),Keypair.generate().secretKey));
 expect((await verify(request("/api/auth/verify",{...fields,signature}),undefined)).status).toBe(401);
 expect((await verify(request("/api/auth/verify",{...fields,origin:"https://other.example",signature}),undefined)).status).toBe(400);
});

it.each(["amount", "memo", "extra instruction", "blockhash", "fee payer"])("rejects altered %s before broadcast", async kind => {
 const {tx,context,id}=await order();
 if(kind==="amount") {const t=SystemInstruction.decodeTransfer(tx.instructions[0]);tx.instructions[0]=SystemProgram.transfer({...t,lamports:1});}
 if(kind==="memo") tx.instructions[1].data=Buffer.from("AIRTIME:another-quote");
 if(kind==="extra instruction") tx.add(SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));
 if(kind==="blockhash") tx.recentBlockhash=Keypair.generate().publicKey.toBase58();
 const other=Keypair.generate(); if(kind==="fee payer")tx.feePayer=other.publicKey;
 tx.sign(...(kind==="fee payer"?[buyer,other]:[buyer]));
 expect((await submit(request("/api/campaigns/"+id+"/transaction",{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(400);
 expect(mocks.send).not.toHaveBeenCalled();
});
it("rejects a different wallet attempting to submit the campaign payment",async()=>{
 const {tx,context,id}=await order();tx.sign(buyer);
 mocks.cookie=await signSession({kind:"wallet",address:Keypair.generate().publicKey.toBase58(),chainId:902},3600);
 expect((await submit(request("/api/campaigns/"+id+"/transaction",{signedTransaction:tx.serialize().toString("base64")}),context)).status).toBe(404);
 expect(mocks.send).not.toHaveBeenCalled();
});
async function submittedOrder() {
 const o=await order();o.tx.sign(buyer);mocks.send.mockRejectedValue(new Error("RPC response lost"));
 const r=await submit(request("/api/campaigns/"+o.id+"/transaction",{signedTransaction:o.tx.serialize().toString("base64")}),o.context);
 expect(r.status).toBe(200);return o;
}
it("keeps an unresolved payment pending after the reservation expires and settles it exactly once",async()=>{
 const o=await submittedOrder();const qid=o.quote.quote.quoteId;
 await db().update(schema.quotes).set({expiresAt:new Date(0)}).where(eq(schema.quotes.id,qid));
 await expireQuotes();
 let [campaign]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,o.id));
 expect(campaign.status).toBe("AWAITING_PAYMENT");
 await expect(createQuote({campaignId:o.id,walletAddress:buyer.publicKey.toBase58()})).rejects.toThrow(/still being checked/);
 mocks.send.mockResolvedValue(bs58.encode(o.tx.signature!));
 expect(await pollAwaitingPayments()).toBe(0);expect(mocks.send).toHaveBeenCalledTimes(2);
 const t=SystemInstruction.decodeTransfer(o.tx.instructions[0]);
 mocks.parsed.mockResolvedValue({slot:101,meta:{err:null,innerInstructions:[]},transaction:{message:{accountKeys:[{pubkey:buyer.publicKey,signer:true}],instructions:[{programId:SystemProgram.programId,parsed:{type:"transfer",info:{source:buyer.publicKey.toBase58(),destination:t.toPubkey.toBase58(),lamports:Number(t.lamports)}}},{programId:new PublicKey(MEMO_PROGRAM),parsed:quoteMemo(qid)}]}}});
 expect(await pollAwaitingPayments()).toBe(1);expect(await pollAwaitingPayments()).toBe(0);
 const payments=await db().select().from(schema.payments).where(eq(schema.payments.quoteId,qid));expect(payments).toHaveLength(1);
 [campaign]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,o.id));expect(campaign.status).toBe("AIRING");
});
it("releases an unlanded transaction after its blockhash expires",async()=>{
 const o=await submittedOrder();mocks.height.mockResolvedValue(1001);
 expect(await pollAwaitingPayments()).toBe(0);
 const [q]=await db().select().from(schema.quotes).where(eq(schema.quotes.id,o.quote.quote.quoteId));
 expect(q.status).toBe("CANCELLED");expect(q.txPayload).toBeNull();expect(q.txError).toMatch(/expired/);
 const [c]=await db().select().from(schema.campaigns).where(eq(schema.campaigns.id,o.id));expect(c.status).toBe("READY_TO_PURCHASE");expect(c.activeQuoteId).toBeNull();
 expect(await db().select().from(schema.payments).where(eq(schema.payments.quoteId,q.id))).toHaveLength(0);
});
it("retires a failed on-chain payment without airing the campaign",async()=>{
 const o=await submittedOrder();mocks.parsed.mockResolvedValue({slot:101,meta:{err:{InstructionError:[0,"InsufficientFunds"]}}});
 expect(await pollAwaitingPayments()).toBe(0);
 const [q]=await db().select().from(schema.quotes).where(eq(schema.quotes.id,o.quote.quote.quoteId));expect(q.txError).toMatch(/failed/);
 expect(await db().select().from(schema.payments).where(eq(schema.payments.quoteId,q.id))).toHaveLength(0);
});

it.each(["failure", "rpc unavailable"])("blocks wallet preparation when simulation reports %s", async kind => {
 const {context,id}=await order();
 if(kind==="failure")mocks.simulate.mockResolvedValueOnce({value:{err:"InsufficientFundsForFee"}});
 else mocks.simulate.mockRejectedValueOnce(new Error("RPC down"));
 const r=await submit(request('/api/campaigns/'+id+'/transaction',{}),context);
 expect(r.status).toBe(kind==="failure"?400:503);
 expect(await r.json()).not.toHaveProperty("transaction");
 expect(mocks.send).not.toHaveBeenCalled();
});
