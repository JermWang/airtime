import { ApiError } from "./api";

/** These endpoint responses occur before a transaction is stored or broadcast.
 * Conflicts, server errors and lost responses remain ambiguous: never invite a second payment.
 */
export function isRejectedPaymentSubmission(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403, 404, 413, 422].includes(error.status);
}
