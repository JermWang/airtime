import { test, expect } from "@playwright/test";

test("station is live: picture, programme and the price board", async ({ page }) => {
  await page.goto("/");
  const heroVideo = page.locator('[aria-label="AIRTIME station"] video').first();
  await expect(heroVideo).toBeAttached();
  await expect(heroVideo).toHaveCSS("object-fit", "contain");
  await expect(page.getByText(/on air|stand by|live/i).first()).toBeVisible({ timeout: 30_000 });
  const state = await page.request.get("/api/broadcast/state?channel=MAIN").then((r) => r.json());
  expect(state.now).toBeTruthy();
  expect(state.next).toBeTruthy();

  // The board sells the picture's two products and the six panels around it,
  // all opening at 0.5.
  const board = await page.request.get("/api/board?channel=MAIN").then((r) => r.json());
  const ids = board.rows.map((r: { placement: { id: string } }) => r.placement.id).sort();
  expect(ids).toEqual(["AD", "PANEL_LEFT", "PANEL_RIGHT", "PANEL_TOP_LEFT", "PANEL_TOP_MID", "PANEL_TOP_RIGHT", "PANEL_TOWER", "SHOW"]);
  for (const row of board.rows) expect(row.surface.askWei).toBe("500000000");

  // Opening a surface goes straight into the purchase flow.
  await page.goto("/airtime/SHOW");
  await expect(page.getByTestId("purchase-flow")).toHaveAttribute("data-step", "connect");
});

test("the mobile splash gives the uncropped picture a full-width row above its panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const station = page.locator('[aria-label="AIRTIME station"]').first();
  const video = station.locator("video");
  await expect(video).toHaveCSS("object-fit", "contain");

  // The picture takes a row to itself above the panels rather than sharing one
  // with them. Measured against a panel rather than against the viewport: the
  // wall sits inside the district's own frame, so "the whole row" is narrower
  // than the window by however much that frame insets it.
  const stationBox = await station.boundingBox();
  const panelBox = await page.locator('a[data-surface="PANEL_TOP_LEFT"]').boundingBox();
  expect(stationBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(stationBox!.width).toBeGreaterThan(panelBox!.width * 2);
  expect(stationBox!.y).toBeLessThan(panelBox!.y);
});

test("panel artwork itself flips the card and the Anduril panel carries the logo", async ({ page }) => {
  await page.goto("/");
  const front = page.getByTestId("treasury-panel-front");
  const back = page.getByTestId("treasury-panel-back");

  await expect(front).toBeVisible();
  await expect(page.getByRole("img", { name: "Anduril", exact: true })).toBeVisible();
  await front.scrollIntoViewIfNeeded();
  const box = await front.boundingBox();
  expect(box).not.toBeNull();

  // Click high in the photographic area, well above the caption/footer that
  // already exposed the original turn-over control.
  await page.mouse.click(box!.x + box!.width / 2, box!.y + 80);
  await expect(back).toHaveAttribute("aria-hidden", "false");
  await expect(back.getByText("Advertising revenue is designated for AIRTIME buybacks and burns")).toBeVisible();
});

test("buy airtime asks for a show or an ad, with both prices live", async ({ page }) => {
    await page.goto("/station");
    await page.getByRole("button", { name: /buy airtime/i }).first().click();
    const chooser = page.getByTestId("product-chooser");
    await expect(chooser).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("product-show")).toContainText(/show/i);
    await expect(page.getByTestId("product-ad")).toContainText(/ad/i);
    // Both products, and the three ad surfaces behind the ad card.
    await page.getByTestId("product-ad").click();
    await expect(page.getByTestId("ad-surface-AD")).toBeVisible();
    await expect(page.getByTestId("ad-surface-PANEL_LEFT")).toBeVisible();
    await expect(page.getByTestId("ad-surface-PANEL_RIGHT")).toBeVisible();
  });


test("Solana wallets and launch branding", async ({page}) => {
 await page.goto('/airtime/SHOW');
 await page.getByRole('button',{name:/connect wallet/i}).first().click();
 await expect(page.getByRole('button',{name:'Phantom',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Solflare',exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/Robinhood|WalletConnect|Ethereum/);
 await page.goto('/');
 await expect(page.getByRole('link',{name:/Launching on StonkFun/i})).toBeVisible();
});
