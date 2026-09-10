import { expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { isRejectedPaymentSubmission } from "@/lib/paymentSubmission";

it.each([400,401,403,404,413,422])("surfaces a definitive pre-broadcast rejection (%s)",status=>{
  expect(isRejectedPaymentSubmission(new ApiError(status,"Rejected"))).toBe(true);
});
it.each([409,429,500,502,503,504])("keeps ambiguous or conflicting submissions protected (%s)",status=>{
  expect(isRejectedPaymentSubmission(new ApiError(status,"Uncertain"))).toBe(false);
});
it("does not label a lost network response as a rejected payment",()=>{
  expect(isRejectedPaymentSubmission(new TypeError("Failed to fetch"))).toBe(false);
});
