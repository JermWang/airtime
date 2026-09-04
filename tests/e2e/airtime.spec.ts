import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { createPublicClient, http, parseAbiItem } from "viem";
import { foundry } from "viem/chains";
import { E2E_CONTRACT } from "../../playwright.config";

/**
 * Primary vertical slice:
 *   watch station → select studio billboard → upload image → preview → read the
 *   live ask → quote → pay on local chain → backend verifies the event → the run
 *   is on air immediately → buyer withdraws → AirLog exists.
 *
 * There is no scheduled window to wait for: paying takes the surface, and the
 * run ends when somebody outbids it or the buyer hands it back.
 */

async function adminLogin(request: APIRequestContext) {
  const res = await request.post("/api/admin/auth/login", { data: { email: "admin@airtime.local", password: "e2e-admin" } });
  expect(res.ok()).toBeTruthy();
}

async function jumpClock(request: APIRequestContext, offsetMs: number) {
  const res = await request.patch("/api/admin/settings", { data: { clockOffsetMs: offsetMs } });
  expect(res.ok()).toBeTruthy();
}

async function connectDevWallet(page: Page) {
  await page.getByRole("button", { name: /connect wallet/i }).first().click();
  await page.getByRole("button", { name: /AIRTIME Dev Wallet/i }).click();
  await expect(page.getByText(/0x7099/i).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("station is live on the homepage: video, program, log and inventory HUD", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("video").first()).toBeAttached();
  await expect(page.getByText(/on air|stand by|live/i).first()).toBeVisible({ timeout: 30_000 });
  const state = await page.request.get("/api/broadcast/state?channel=MAIN").then((r) => r.json());
  expect(state.now).toBeTruthy();
  expect(state.next).toBeTruthy();
  // Browse all inventory from the studio control and open the left billboard.
  await page.getByRole("button", { name: /browse all inventory/i }).click();
  await page.getByRole("button", { name: /Left studio billboard/i }).click();
  await expect(page.getByTestId("placement-panel")).toBeVisible();
  await expect(page.getByTestId("purchase-flow")).toHaveAttribute("data-step", "connect");
});

test("full purchase → on-chain verification → queue → air → AirLog", async ({ page, request }) => {
  await page.goto("/airtime/SHOW");
  await expect(page.getByTestId("purchase-flow")).toHaveAttribute("data-step", "connect");

  // 1. connect + sign in (SIWE) with the local dev wallet
  await connectDevWallet(page);
  await page.getByTestId("sign-in").click();
  await expect(page.getByTestId("purchase-flow")).toHaveAttribute("data-step", "creative", { timeout: 30_000 });

  // 2. upload a valid creative
  await page.getByTestId("display-name").fill("Playwright Motors");
  const png = await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 31, g: 224, b: 122 } } }).png().toBuffer();
  await page.getByTestId("creative-file-input").setInputFiles({ name: "spot.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("purchase-flow")).toHaveAttribute("data-step", "price", { timeout: 60_000 });
  // WYSIWYG preview is rendered on the surface
  await expect(page.locator("img[src*='/media/creatives/']").first()).toBeVisible();

  // 3. the surface is asking a live, falling price
  const ticker = page.getByTestId("ask-ticker");
  await expect(ticker).toBeVisible({ timeout: 30_000 });
  await expect(ticker).toHaveAttribute("data-status", "OPEN");
  const askText = await page.getByTestId("ask-amount").textContent();
  expect(askText).toMatch(/ETH/);

  // 4. server quote at that ask
  await page.getByTestId("get-quote").click();
  await expect(page.getByTestId("quote")).toBeVisible({ timeout: 30_000 });
  const amountText = await page.getByTestId("quote-amount").textContent();
  expect(amountText).toMatch(/ETH/);

  // 5. pay on the local chain (dev wallet signs + sends to anvil), backend verifies the event
  await page.getByTestId("pay").click();
  await expect(page.getByTestId("purchase-done")).toBeVisible({ timeout: 120_000 });
  // Paying puts you on air immediately: there is no queue to wait in.
  await expect(page.getByText(/on air now|taking the surface/i).first()).toBeVisible();

  const campaignHref = await page.getByTestId("campaign-link").getAttribute("href");
  expect(campaignHref).toMatch(/^\/campaign\//);
  const campaignId = campaignHref!.split("/").pop()!;

  // Backend state: PAID→AIRING with a payment whose event exists on chain.
  const campaign = await request.get(`/api/campaigns/${campaignId}`).then((r) => r.json());
  expect(["PAID", "AIRING"]).toContain(campaign.status);
  expect(campaign.payment.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  const client = createPublicClient({ chain: foundry, transport: http("http://127.0.0.1:8545") });
  const logs = await client.getLogs({
    address: E2E_CONTRACT,
    event: parseAbiItem("event AirtimePurchased(bytes32 indexed quoteId, address indexed buyer, bytes32 indexed placementId, bytes32 creativeHash, uint64 startAt, uint64 endAt, address paymentToken, uint256 amount)"),
    fromBlock: 0n,
  });
  const matching = logs.find((l) => l.transactionHash === campaign.payment.txHash);
  expect(matching).toBeTruthy();
  expect(matching!.args.creativeHash).toBe(campaign.creative.creativeHash);
  expect(matching!.args.amount?.toString()).toBe(campaign.payment.amountWei);

  // 6. the run is live on the board straight away, with no scheduled end.
  await adminLogin(request);
  await expect.poll(async () => (await request.get(`/api/campaigns/${campaignId}`).then((r) => r.json())).status, { timeout: 30_000 }).toBe("AIRING");
  const live = await request.get(`/api/campaigns/${campaignId}`).then((r) => r.json());
  expect(live.endsAt).toBeNull();
  expect(BigInt(live.pricePaidWei)).toBeGreaterThan(0n);

  const queue = await request.get("/api/queue?channel=MAIN").then((r) => r.json());
  expect(queue.onAir.some((e: { id: string }) => e.id === campaignId)).toBe(true);
  const activations = await request.get("/api/activations?channel=MAIN").then((r) => r.json());
  expect(activations.active.some((e: { id: string; placementId: string }) => e.id === campaignId && e.placementId === "SHOW")).toBe(true);

  // The surface now asks the takeover premium and is protected for the guaranteed runtime.
  const surface = await request.get("/api/placements/SHOW/surface").then((r) => r.json());
  expect(surface.occupant.campaignId).toBe(campaignId);
  expect(surface.status).toBe("PROTECTED");
  expect(BigInt(surface.askWei)).toBeGreaterThan(BigInt(live.pricePaidWei));

  // The studio shows the creative on the left billboard placement (activation feed drives the texture).
  await page.goto("/queue");
  await expect(page.getByText("Playwright Motors").first()).toBeVisible();

  // 7. the buyer hands the surface back → completion + AirLog. Nothing else
  // ends a run except a higher bidder.
  // The wallet session lives in the page context, so the buyer withdraws from there.
  const withdrawn = await page.request.post(`/api/campaigns/${campaignId}/withdraw`);
  expect(withdrawn.ok()).toBeTruthy();
  await expect.poll(async () => (await request.get(`/api/campaigns/${campaignId}`).then((r) => r.json())).status, { timeout: 30_000 }).toBe("COMPLETED");
  const done = await request.get(`/api/campaigns/${campaignId}`).then((r) => r.json());
  expect(done.airLogId).toBeTruthy();

  await page.goto(`/airlog/${done.airLogId}`);
  await expect(page.getByTestId("airlog")).toBeVisible();
  await expect(page.getByText("Playwright Motors")).toBeVisible();
  await expect(page.getByText(/proof of air/i)).toBeVisible();
  await expect(page.getByText(campaign.payment.txHash.slice(0, 10))).toBeVisible();

  await jumpClock(request, 0);
});

test("treasury reports airtime revenue and operator-recorded pre-stock", async ({ page, request }) => {
  await adminLogin(request);
  // Record a purchase of Anduril pre-stock funded by the airtime revenue earned above.
  const created = await request.post("/api/admin/treasury", {
    data: { kind: "STOCK_PURCHASE", amountWei: "1000000000000000", shares: "3.5", reference: "e2e-broker-1", note: "E2E" },
  });
  expect(created.ok()).toBeTruthy();

  const treasury = await request.get("/api/treasury").then((r) => r.json());
  expect(BigInt(treasury.summary.airtimeRevenueWei)).toBeGreaterThan(0n);
  expect(treasury.summary.airtimePayments).toBeGreaterThan(0);
  expect(treasury.summary.sharesHeld).toBe("3.5");

  await page.goto("/treasury");
  await expect(page.getByRole("heading", { name: "Treasury" })).toBeVisible();
  await expect(page.getByText("Anduril pre-stock bought").first()).toBeVisible();
  await expect(page.getByText("3.5 sh").first()).toBeVisible();
  // Airtime revenue is derived, never typed in.
  await expect(page.getByText(/verified payment/i).first()).toBeVisible();
});

test("a quote cannot be replayed and the surface goes back on the market", async ({ request }) => {
  const queue = await request.get("/api/queue?channel=MAIN").then((r) => r.json());
  const recent = queue.recent[0];
  expect(recent).toBeTruthy();
  // The surface is free again and its ask descends from what it last cleared at.
  const surface = await request.get("/api/placements/SHOW/surface").then((r) => r.json());
  expect(surface.occupant).toBeNull();
  expect(surface.forSale).toBe(true);
  expect(BigInt(surface.lastClearingPriceWei)).toBeGreaterThan(0n);
  expect(BigInt(surface.askWei)).toBeLessThanOrEqual(BigInt(surface.anchorWei));
  // Payment for the consumed quote is recorded exactly once.
  await adminLogin(request);
  const payments = await request.get("/api/admin/payments").then((r) => r.json());
  const forCampaign = payments.payments.filter((p: { campaignId: string }) => p.campaignId === recent.id);
  expect(forCampaign).toHaveLength(1);
});
