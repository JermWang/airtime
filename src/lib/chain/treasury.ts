/**
 * The AIRTIME treasury.
 *
 * Every airtime payment is sent to this address and confirmed from it. It is a
 * public fact about the network, so it is readable in the browser: the address
 * chip in the bottom bar and the purchase flow both show the same value the
 * server verifies against.
 *
 * Override with NEXT_PUBLIC_TREASURY_ADDRESS.
 */
export const TREASURY_ADDRESS = ((): `0x${string}` => {
  const configured = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
  if (configured && /^0x[0-9a-fA-F]{40}$/.test(configured)) return configured as `0x${string}`;
  return "0xaF259a8Daf123Db203Fe5eA39fc9BE1b98048601";
})();

/** 0x1234…cdef — the form used in the interface. Never used for verification. */
export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (!address.startsWith("0x") || address.length < lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
