import { describe, expect, it } from "vitest";
import { marqueeCopies } from "@/lib/marquee";

/**
 * The property that matters is coverage: after the track has travelled one
 * copy, the copies that remain must still span the strip. If they do not, the
 * loop shows dead space before it snaps back.
 */
function covers(boxWidth: number, runWidth: number): boolean {
  return (marqueeCopies(boxWidth, runWidth) - 1) * runWidth >= boxWidth;
}

describe("marqueeCopies", () => {
  it("never renders fewer than the two copies a loop needs", () => {
    expect(marqueeCopies(300, 4000)).toBe(2);
    expect(marqueeCopies(0, 0)).toBe(2);
    expect(marqueeCopies(-10, 500)).toBe(2);
    expect(marqueeCopies(500, Number.NaN)).toBe(2);
  });

  it("adds a copy once the list is narrower than the strip", () => {
    // The partner row: eight marks, about 1187px, on a 1885px viewport. Two
    // copies leave 698px of nothing at the end of the travel.
    expect(marqueeCopies(1885, 1187)).toBe(3);
    expect(marqueeCopies(2545, 1187)).toBe(4);
    expect(marqueeCopies(985, 1187)).toBe(2);
  });

  it("covers the strip at every width a browser might report", () => {
    for (let box = 320; box <= 4096; box += 7) {
      for (const run of [180, 419, 1059, 1187, 1621, 3000]) {
        expect(covers(box, run), `box=${box} run=${run}`).toBe(true);
      }
    }
  });

  it("does not add a copy that earns nothing", () => {
    // Exactly one copy per strip width still needs one spare, not two.
    expect(marqueeCopies(1000, 1000)).toBe(2);
    expect(marqueeCopies(2000, 1000)).toBe(3);
  });
});
