/** Fixed-point decimal conversion with no floating-point money arithmetic. */
export function formatUnits(value: bigint, decimals = 9): string {
 const negative = value < 0n; const abs = negative ? -value : value; const scale = 10n ** BigInt(decimals);
 const fraction = (abs % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
 return `${negative ? "-" : ""}${abs / scale}${fraction ? "." + fraction : ""}`;
}
export function parseUnits(value: string, decimals = 9): bigint {
 if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive decimal amount");
 const [whole, fraction = ""] = value.split(".");
 if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places`);
 return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}
export const parseSol = (value: string) => parseUnits(value, 9);
