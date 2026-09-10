import { test, expect } from "@playwright/test";
import type { StonkfunSnapshot } from "../../src/lib/stonkfun";

test("treasury waits for AIRTIME's CA without inventing token or reward totals", async ({ page }) => {
  await page.goto("/treasury");
  const panel = page.getByTestId("stonkfun-token");
  await expect(panel).toContainText("CA coming soon");
  await expect(panel).not.toContainText("Total rewards paid");
  await expect(panel).not.toContainText("$0");
  await expect(page.getByText("Airtime advertising revenue", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("StonkFun reporting displays live, stale, and Standard Mode data clearly", async ({ page }) => {
  const mint = "HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR";
  const signature = "3FcjMG5S1f4PuN5YAB37mhCBk3UC73GgJQPAfNQhEZkbfZUp4954iArv39zFXU9kHb6hXHBMxMGEuFXaHb18gtpu";
  const time = new Date().toISOString();
  const snapshot: StonkfunSnapshot = { status: "live", mint, tokenUrl: `https://www.stonkfun.xyz/token/${mint}`, sourceUpdatedAt: time, checkedAt: time,
    data: {
      token: { mint, name: "AIRTIME preview", symbol: "AIRTIME", mode: "reward", quote: { mint, symbol: "ANDURIL" }, market: { priceUsd: 0.002, marketCapUsd: 2000000, volume24hUsd: 150000, priceChange24h: -3.2 }, transferFee: { bps: 100 }, flywheel: { active: true } },
      rewards: { quote: { mint, symbol: "ANDURIL", decimals: 6 }, rewards: { distributedTokens: 125.5, undistributedTokens: 2.4, payoutCount: 900, holderCount: 200, lastPayoutAt: time } },
      burns: { totals: { amountTokens: 1000, valueUsdAtBurn: 2, burnCount: 1, lastBurnAt: time }, burns: [{ signature, amountTokens: 1000, valueUsdAtBurn: 2, burnedAt: time, source: "flywheel" }] },
    },
  };
  // Browser-only fixture, never installed as the production CA or reported to the backend.
  await page.route("**/api/token", route => route.fulfill({ json: snapshot }));
  await page.goto("/treasury");
  const panel = page.getByTestId("stonkfun-token");
  await expect(panel).toContainText("125.5 ANDURIL");
  await expect(panel).toContainText("Reward Mode");
  await expect(panel.getByRole("link", { name: "View on Solscan" })).toHaveAttribute("href", `https://solscan.io/tx/${signature}`);
  await panel.screenshot({ path: ".render/stonkfun-reporting-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await panel.screenshot({ path: ".render/stonkfun-reporting-mobile.png" });
  snapshot.status = "stale";
  await page.reload();
  await expect(panel).toContainText("Showing the last available");
  await expect(panel).toContainText("125.5 ANDURIL");
  snapshot.status = "live"; snapshot.data!.token.mode = "standard"; snapshot.data!.rewards.rewards = null;
  await page.reload();
  await expect(panel).toContainText("Holder rewards are not enabled for this mode");
  await expect(panel).not.toContainText("Total rewards paid");
});
