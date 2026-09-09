import { isPaymentChain } from "@/lib/chain/chains";
import { publicClient, resetPublicClientForTests, serverRpcUrl } from "./client";
export function clientFor(id: number) { if (!isPaymentChain(id)) throw new Error("This payment belongs to another network"); return publicClient(); }
export const rpcUrlFor = (id: number) => { clientFor(id); return serverRpcUrl(); };
export const resetChainClientsForTests = resetPublicClientForTests;
