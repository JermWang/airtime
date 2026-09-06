/**
 * How many copies of a list a scrolling strip needs to loop without a seam.
 *
 * A marquee loops by translating its track left by exactly one copy and then
 * snapping back. For that jump to be invisible, whatever is left on screen at
 * the end of the travel must still cover the whole strip — so the copies that
 * are *not* consumed by the travel have to span it. Two copies only satisfy
 * that while one copy is already as wide as the strip; a short list on a wide
 * screen runs out and drags an empty gap through the row before it jumps.
 */
export function marqueeCopies(boxWidth: number, runWidth: number): number {
  if (!(runWidth > 0) || !(boxWidth > 0)) return 2;
  return Math.max(2, Math.ceil(boxWidth / runWidth) + 1);
}
