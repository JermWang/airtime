/** Amounts are lamports; legacy database column names remain compatible. */
export interface SignedQuoteWire { quoteId: string; buyer: string; placementId: string; creativeHash: string; startAt: string; endAt: string; paymentToken: string; amount: string; expiresAt: string; nonce: string; signature: string; chainId: number; contract: string; }
export interface QuoteStruct { quoteId: string; buyer: string; placementId: string; creativeHash: string; startAt: bigint; endAt: bigint; paymentToken: string; amount: bigint; expiresAt: bigint; nonce: bigint; }
