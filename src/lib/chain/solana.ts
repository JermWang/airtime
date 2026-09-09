import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export function isSolanaAddress(value: string): boolean { try { return new PublicKey(value).toBase58() === value; } catch { return false; } }
export function isSolanaSignature(value: string): boolean { try { return bs58.decode(value).length === 64; } catch { return false; } }
export const quoteMemo = (id: string): string => `AIRTIME:${id}`;
export function signInMessage(i: { address: string; origin: string; nonce: string; chainId: number }): string {
 return `${new URL(i.origin).host} wants you to sign in with your Solana account:\n${i.address}\n\nSign in to AIRTIME. This signature costs nothing and does not authorize a payment.\n\nURI: ${i.origin}\nVersion: 1\nNetwork: solana:${i.chainId}\nNonce: ${i.nonce}`;
}
