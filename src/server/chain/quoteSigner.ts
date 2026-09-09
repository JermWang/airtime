import { createHash, createHmac } from "node:crypto";
import type { QuoteStruct } from "@/lib/chain/airtimePayments";
import { activeChain } from "@/lib/chain/chains";
import { sessionSecret } from "../env";
export const placementIdHash = (id: string): string => createHash("sha256").update(id).digest("hex");
/** Integrity tag. Settlement verifies the stored quote and finalized chain data. */
export async function signQuote(quote: QuoteStruct, treasury: string, chainId = activeChain().id): Promise<string> {
 return createHmac("sha256", sessionSecret()).update(JSON.stringify({ quote, treasury, chainId }, (_, v) => typeof v === "bigint" ? v.toString() : v)).digest("hex");
}
