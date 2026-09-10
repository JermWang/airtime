import { test, expect } from "@playwright/test";
import type { BoardRowDto, PlacementDto } from "../../src/lib/api";

// Test-only wallet/session and campaign responses; these checks never sign or submit a payment.
for (const [placementId, ratio] of [["PANEL_LEFT", "9:16"], ["PANEL_RIGHT", "9:16"], ["PANEL_TOWER", "9:16"], ["PANEL_TOP_LEFT", "16:9"], ["PANEL_TOP_RIGHT", "1:1"]]) {
  test(`${placementId} keeps checkout and live framing identical on desktop and mobile`, async ({ page }) => {
    const wallet = "11111111111111111111111111111112";
    const { placements } = await page.request.get("/api/placements").then(r => r.json()) as { placements: PlacementDto[] };
    const placement = placements.find(p => p.id === placementId)!;
    expect(placement.aspectRatio).toBe(ratio);
    const creative = { id: "preview-media", type: "IMAGE", status: "VALID", url: "/Banner.jpg", posterUrl: null, mimeType: "image/jpeg", width: 1280, height: 480, textContent: null, creativeHash: "preview", contentHash: "preview" };
    const campaign = { id: "preview-test", displayName: "Panel framing test", status: "READY_TO_PURCHASE", placement, placementId, creative, fit: "FIT", clickUrl: "https://airtime.media", wallet, payment: null, startsAt: null, endsAt: null, pricePaidWei: null, activeQuoteId: null };
    await page.addInitScript(address => {
      Object.assign(window, { phantom: { solana: { publicKey: { toBase58: () => address }, connect: async () => ({ publicKey: { toBase58: () => address } }) } } });
    }, wallet);
    await page.route("**/api/auth/session", route => route.fulfill({ json: { wallet: { address: wallet, chainId: 901 } } }));
    await page.route("**/api/campaigns/preview-test", route => route.fulfill({ json: campaign }));
    await page.route("**/api/campaigns/preview-test/quote", route => route.fulfill({ status: 404, json: { error: "No quote" } }));
    await page.goto("/campaign/preview-test");
    await page.getByRole("button", { name: /connect wallet/i }).first().click();
    await page.getByRole("button", { name: "Phantom", exact: true }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    const preview = page.getByTestId("creative-preview");
    await expect(preview).toContainText(placement.name);
    const [w, h] = ratio.split(":").map(Number);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const frame = preview.getByTestId("ad-surface-frame");
      const box = await frame.boundingBox();
      expect(box!.height).toBeGreaterThan(50);
      expect(box!.width / box!.height).toBeCloseTo(w / h, 2);
      await expect(frame.locator("img")).toHaveCSS("object-fit", "contain");
      await page.getByRole("button", { name: "FILL", exact: true }).click();
      await expect(frame.locator("img")).toHaveCSS("object-fit", "cover");
      await page.getByRole("button", { name: "FIT", exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await preview.screenshot({ path: `.render/${placementId}-preview.png` });

    const board = await page.request.get("/api/board?channel=MAIN").then(r => r.json());
    const row = board.rows.find((r: BoardRowDto) => r.placement.id === placementId);
    const occupant = { ...campaign, placementName: placement.name, status: "AIRING", fit: "FILL" };
    row.occupant = occupant;
    await page.route("**/api/board?*", route => route.fulfill({ json: board }));
    await page.route("**/api/activations?*", route => route.fulfill({ json: { active: [occupant] } }));
    await page.goto("/");
    const liveFrame = page.locator(`[data-surface="${placementId}"]`).getByTestId("ad-surface-frame");
    await expect(liveFrame).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      // The wall tilts panels in perspective. Compare the media canvas before
      // that visual transform, which must not change its crop or proportions.
      const box = await liveFrame.evaluate(el => {
        const style = getComputedStyle(el);
        return { width: parseFloat(style.width), height: parseFloat(style.height) };
      });
      expect(box.height).toBeGreaterThan(20);
      expect(box.width / box.height).toBeCloseTo(w / h, 2);
      await expect(liveFrame.locator("img")).toHaveCSS("object-fit", "cover");
      if (placementId === "PANEL_LEFT") await page.locator('[data-surface="PANEL_LEFT"]').screenshot({ path: `.render/left-panel-live-${width}.png` });
    }
  });
}
