import { describe, expect, it } from "vitest";
import { nativeRefundMismatch } from "@/server/chain/refundVerifier";

const payment = {
  chainId: 31337,
  buyer: "0x1111111111111111111111111111111111111111",
  paymentToken: "0x0000000000000000000000000000000000000000",
  amountWei: "25000000000000000",
};

describe("native refund verification", () => {
  it("accepts only the exact treasury-to-buyer repayment", () => {
    expect(
      nativeRefundMismatch(payment, {
        from: "0xaF259a8Daf123Db203Fe5eA39fc9BE1b98048601",
        to: payment.buyer,
        value: BigInt(payment.amountWei),
      }),
    ).toBeNull();
  });

  it("rejects a transaction from another sender", () => {
    expect(
      nativeRefundMismatch(payment, {
        from: "0x2222222222222222222222222222222222222222",
        to: payment.buyer,
        value: BigInt(payment.amountWei),
      }),
    ).toMatch(/treasury/);
  });

  it("rejects the wrong buyer or amount", () => {
    expect(
      nativeRefundMismatch(payment, {
        from: "0xaF259a8Daf123Db203Fe5eA39fc9BE1b98048601",
        to: "0x3333333333333333333333333333333333333333",
        value: BigInt(payment.amountWei),
      }),
    ).toMatch(/original buyer/);
    expect(
      nativeRefundMismatch(payment, {
        from: "0xaF259a8Daf123Db203Fe5eA39fc9BE1b98048601",
        to: payment.buyer,
        value: 1n,
      }),
    ).toMatch(/amount/);
  });
});
