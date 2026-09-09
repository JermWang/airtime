import { Connection } from "@solana/web3.js";
import { activeChain, activeChainEnv } from "@/lib/chain/chains";
import { env } from "../env";
let connection: Connection | undefined;
export const serverRpcUrl = (): string => env().SOLANA_RPC_URL || activeChain().rpcUrls.default.http[0];
export const publicClient = (): Connection => connection ??= new Connection(serverRpcUrl(), "finalized");
export function resetPublicClientForTests(): void { connection = undefined; verifiedCluster = undefined; }

let verifiedCluster: Promise<void> | undefined;
/** Check a private RPC against the canonical network before accepting payments. */
export async function assertConfiguredCluster(): Promise<void> {
 if (activeChainEnv() === "local") return;
 verifiedCluster ??= (async () => {
  const expectedRpc = activeChain().rpcUrls.default.http[0];
  if (serverRpcUrl() === expectedRpc) return;
  const [actual, expected] = await Promise.all([publicClient().getGenesisHash(), new Connection(expectedRpc).getGenesisHash()]);
  if (actual !== expected) throw new Error("The Solana RPC does not match the configured network");
 })().catch(error => { verifiedCluster = undefined; throw error; });
 return verifiedCluster;
}
