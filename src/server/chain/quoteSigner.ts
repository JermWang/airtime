import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { eip712Domain, quoteTypes, type QuoteStruct } from "@/lib/chain/airtimePayments";
import { activeChain } from "@/lib/chain/chains";
import { env, isProduction } from "../env";

/**
 * Backend EIP-712 quote signer.
 *
 * The private key never leaves the server. Its address must equal
 * `quoteSigner()` on the deployed AirtimePayments contract. The key has no
 * funds and no other authority – rotating it only requires `setQuoteSigner`.
 */

let account: PrivateKeyAccount | null = null;

/** Deterministic, publicly-known dev key (anvil account #9). Never used in production. */
const DEV_SIGNER_KEY: Hex = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

export function quoteSignerAccount(): PrivateKeyAccount {
  if (account) return account;
  let key = env().AIRTIME_QUOTE_SIGNER_PRIVATE_KEY as Hex;
  if (!key) {
    if (isProduction()) throw new Error("AIRTIME_QUOTE_SIGNER_PRIVATE_KEY is required in production");
    key = DEV_SIGNER_KEY;
  }
  account = privateKeyToAccount(key);
  return account;
}

export function quoteSignerAddress(): Address {
  return quoteSignerAccount().address;
}

/** bytes32 identifier for a placement id string (matches the contract's indexed topic). */
export function placementIdHash(placementId: string): Hex {
  return keccak256(toHex(placementId));
}

export async function signQuote(quote: QuoteStruct, contract: Address, chainId = activeChain().id): Promise<Hex> {
  const signer = quoteSignerAccount();
  return signer.signTypedData({
    domain: eip712Domain(chainId, contract),
    types: quoteTypes,
    primaryType: "Quote",
    message: quote,
  });
}
