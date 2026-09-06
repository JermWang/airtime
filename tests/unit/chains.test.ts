import { afterEach, describe, expect, it } from "vitest";
import { paymentChains } from "@/lib/chain/chains";

const originalEnv = process.env.NEXT_PUBLIC_CHAIN_ENV;
const originalIds = process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_CHAIN_ENV;
  else process.env.NEXT_PUBLIC_CHAIN_ENV = originalEnv;
  if (originalIds === undefined) delete process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS;
  else process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS = originalIds;
});

describe("payment chain configuration", () => {
  it("cannot exclude the active deployment chain", () => {
    process.env.NEXT_PUBLIC_CHAIN_ENV = "testnet";
    process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS = "11155111";
    expect(paymentChains().map((chain) => chain.id)).toEqual([46630, 11155111]);
  });

  it("falls back to the environment defaults when no configured ids are known", () => {
    process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
    process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS = "999999999";
    expect(paymentChains().map((chain) => chain.id)).toEqual([31337]);
  });
});
