import type { Address, Hex } from "viem";

/** ABI subset of contracts/src/AirtimePayments.sol used by the app. */
export const airtimePaymentsAbi = [
  {
    type: "function",
    name: "purchase",
    stateMutability: "payable",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "quoteId", type: "bytes32" },
          { name: "buyer", type: "address" },
          { name: "placementId", type: "bytes32" },
          { name: "creativeHash", type: "bytes32" },
          { name: "startAt", type: "uint64" },
          { name: "endAt", type: "uint64" },
          { name: "paymentToken", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiresAt", type: "uint64" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "consumedQuotes",
    stateMutability: "view",
    inputs: [{ name: "quoteId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "quoteSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "supportedTokens",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "protectedUntil",
    stateMutability: "view",
    inputs: [{ name: "placementId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "event",
    name: "AirtimePurchased",
    inputs: [
      { name: "quoteId", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "placementId", type: "bytes32", indexed: true },
      { name: "creativeHash", type: "bytes32", indexed: false },
      { name: "startAt", type: "uint64", indexed: false },
      { name: "endAt", type: "uint64", indexed: false },
      { name: "paymentToken", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "InvalidSignature", inputs: [] },
  { type: "error", name: "WrongBuyer", inputs: [{ name: "expected", type: "address" }, { name: "actual", type: "address" }] },
  { type: "error", name: "QuoteExpired", inputs: [{ name: "expiresAt", type: "uint64" }, { name: "nowTs", type: "uint256" }] },
  { type: "error", name: "QuoteAlreadyConsumed", inputs: [{ name: "quoteId", type: "bytes32" }] },
  { type: "error", name: "NonceAlreadyUsed", inputs: [{ name: "buyer", type: "address" }, { name: "nonce", type: "uint256" }] },
  { type: "error", name: "UnsupportedToken", inputs: [{ name: "token", type: "address" }] },
  { type: "error", name: "WrongPaymentAmount", inputs: [{ name: "expected", type: "uint256" }, { name: "actual", type: "uint256" }] },
  { type: "error", name: "UnexpectedNativeValue", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "InvalidWindow", inputs: [] },
  { type: "error", name: "PlacementProtected", inputs: [{ name: "placementId", type: "bytes32" }, { name: "protectedUntil", type: "uint64" }] },
  { type: "error", name: "TreasuryTransferFailed", inputs: [] },
] as const;

/** EIP-712 type definition; must match QUOTE_TYPEHASH in the contract. */
export const quoteTypes = {
  Quote: [
    { name: "quoteId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "placementId", type: "bytes32" },
    { name: "creativeHash", type: "bytes32" },
    { name: "startAt", type: "uint64" },
    { name: "endAt", type: "uint64" },
    { name: "paymentToken", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const EIP712_DOMAIN_NAME = "AirtimePayments";
export const EIP712_DOMAIN_VERSION = "1";

export function eip712Domain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Wire representation of a signed quote (all integers as decimal strings). */
export interface SignedQuoteWire {
  quoteId: Hex;
  buyer: Address;
  placementId: Hex;
  creativeHash: Hex;
  startAt: string;
  endAt: string;
  paymentToken: Address;
  amount: string;
  expiresAt: string;
  nonce: string;
  signature: Hex;
  chainId: number;
  contract: Address;
}

export interface QuoteStruct {
  quoteId: Hex;
  buyer: Address;
  placementId: Hex;
  creativeHash: Hex;
  startAt: bigint;
  endAt: bigint;
  paymentToken: Address;
  amount: bigint;
  expiresAt: bigint;
  nonce: bigint;
}

export function quoteStructFromWire(q: SignedQuoteWire): QuoteStruct {
  return {
    quoteId: q.quoteId,
    buyer: q.buyer,
    placementId: q.placementId,
    creativeHash: q.creativeHash,
    startAt: BigInt(q.startAt),
    endAt: BigInt(q.endAt),
    paymentToken: q.paymentToken,
    amount: BigInt(q.amount),
    expiresAt: BigInt(q.expiresAt),
    nonce: BigInt(q.nonce),
  };
}
