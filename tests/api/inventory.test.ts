import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { encodeEventTopics, encodeAbiParameters, verifyTypedData, keccak256, toHex, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/* Chain access is mocked: tests never talk to an RPC. */
const chainMock = vi.hoisted(() => ({
  blockNumber: 100n,
  logs: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/server/chain/client", () => ({
  publicClient: () => ({
    getBlockNumber: async () => chainMock.blockNumber,
    getLogs: async () => chainMock.logs,
    getTransactionReceipt: async () => {
      throw new Error("no receipt");
    },
  }),
  paymentContractAddress: () => "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  requiredConfirmations: () => 1,
  serverRpcUrl: () => "mock",
  resetPublicClientForTests: () => {},
}));

/* Link submissions are probed server-side; the probe is driven against a stub
   rather than the internet. DNS is stubbed too, so the SSRF guard sees a public
   address for the fixture host. */
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

/* The CDN the probe fetches from. It speaks node:https, because that is the
   transport the probe uses in order to pin DNS for itself. */
const linkMock = vi.hoisted(() => ({ status: 200, contentType: "application/vnd.apple.mpegurl", cors: true, body: "" }));
vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  return {
    request: (options: { method?: string }, callback: (res: unknown) => void) =>
      Object.assign(new EventEmitter(), {
        setTimeout: () => {},
        destroy: () => {},
        end: () => {
          const headers: Record<string, string> = { "content-type": linkMock.contentType };
          if (linkMock.cors) headers["access-control-allow-origin"] = "*";
          const isHead = (options.method ?? "GET") === "HEAD";
          const res = Object.assign(Readable.from(isHead ? [] : [Buffer.from(linkMock.body)]), { statusCode: linkMock.status, headers });
          setImmediate(() => callback(res));
        },
      }),
  };
});

import { boot } from "@/server/boot";
import { db, schema, closeDb } from "@/server/db/client";
import { createCreativeFromUpload, createLinkCreative } from "@/server/ads/creatives";
import { createCampaign, getCampaignDetail, getPublicQueue, getBoard } from "@/server/ads/campaigns";
import { createQuote, expireQuotes } from "@/server/ads/quotes";
import { getSurfaceState, activeHold } from "@/server/ads/auction";
import { pollAwaitingPayments } from "@/server/chain/paymentVerifier";
import { withdrawRun } from "@/server/ads/activation";
import { getBroadcastState, ensureScheduleHorizon, insertManualBlock } from "@/server/broadcast/schedule";
import { serverNow, setClockOffsetMs, addSeconds } from "@/server/time/clock";
import { quoteSignerAddress } from "@/server/chain/quoteSigner";
import { airtimePaymentsAbi, eip712Domain, quoteTypes } from "@/lib/chain/airtimePayments";
import { HttpError } from "@/server/http";

const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const wallet = buyer.address.toLowerCase() as Address;

async function png(w = 1280, h = 720): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 220, b: 120 } } })
    .png()
    .toBuffer();
}

/**
 * Stand in for a CDN. HEAD answers with a content type and CORS; GET returns an
 * HLS playlist whose EXTINF lines add up to `durationSec`.
 */
function serveLink(opts: { contentType?: string; durationSec?: number; cors?: boolean; status?: number; body?: string } = {}) {
  const contentType = opts.contentType ?? "application/vnd.apple.mpegurl";
  const durationSec = opts.durationSec ?? 600;
  linkMock.contentType = contentType;
  linkMock.cors = opts.cors !== false;
  linkMock.status = opts.status ?? 200;
  linkMock.body = opts.body ?? ["#EXTM3U", "#EXT-X-TARGETDURATION:10", `#EXTINF:${durationSec.toFixed(3)},`, "seg0.ts", "#EXT-X-ENDLIST"].join("\n");
}

async function showLink(walletAddress: `0x${string}`, name = "show", durationSec = 600) {
  serveLink({ durationSec });
  try {
    return await createLinkCreative({ walletAddress, placementId: "SHOW", url: `https://cdn.example.com/${name}.m3u8` });
  } finally {
    vi.unstubAllGlobals();
  }
}

async function placement(id: string) {
  const [p] = await db().select().from(schema.placements).where(eq(schema.placements.id, id));
  return p;
}

function purchasedLog(q: { id: string; walletAddress: string; placementIdHash: string; creativeHash: string; startsAt: Date; endsAt: Date; paymentToken: string; amountWei: string }, txHash: Hex, blockNumber: bigint) {
  const topics = encodeEventTopics({ abi: airtimePaymentsAbi, eventName: "AirtimePurchased", args: { quoteId: q.id as Hex, buyer: q.walletAddress as Address, placementId: q.placementIdHash as Hex } });
  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint64" }, { type: "uint64" }, { type: "address" }, { type: "uint256" }],
    [q.creativeHash as Hex, BigInt(Math.floor(q.startsAt.getTime() / 1000)), BigInt(Math.floor(q.endsAt.getTime() / 1000)), q.paymentToken as Address, BigInt(q.amountWei)],
  );
  return { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", topics, data, transactionHash: txHash, blockNumber, logIndex: 0, blockHash: "0x1", transactionIndex: 0, removed: false };
}

beforeAll(async () => {
  await boot({ ticker: false });
});

/**
 * There are only two surfaces in the room now, so every test shares them. Each
 * one starts from a pristine market: nothing held, nothing on air, both prices
 * back at the opening 0.01.
 */
beforeEach(async () => {
  setClockOffsetMs(0);
  chainMock.logs = [];
  await db().update(schema.reservations).set({ status: "RELEASED" }).where(eq(schema.reservations.status, "HELD"));
  await db().update(schema.quotes).set({ status: "CANCELLED" }).where(eq(schema.quotes.status, "ACTIVE"));
  await db().update(schema.campaigns).set({ status: "CANCELLED" }).where(eq(schema.campaigns.status, "AIRING"));
  await db().update(schema.placements).set({ currentCampaignId: null, lastClearingPriceWei: "0", askResetAt: serverNow() });
});

afterAll(async () => {
  setClockOffsetMs(0);
  await closeDb();
});

describe("creative validation", () => {
  it("accepts a valid PNG, hashes it and re-encodes it", async () => {
    const c = await createCreativeFromUpload({ walletAddress: wallet, placementId: "AD", bytes: await png(), filename: "brand.png" });
    expect(c.status).toBe("VALID");
    expect(c.width).toBe(1280);
    expect(c.creativeHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(c.url).toMatch(/^\/media\/creatives\//);
  });

  it("rejects disguised files and oversized images gracefully", async () => {
    const bad = await createCreativeFromUpload({ walletAddress: wallet, placementId: "AD", bytes: Buffer.from("<html><script>alert(1)</script></html>"), filename: "ad.png" });
    expect(bad.status).toBe("INVALID");
    expect(bad.validationErrors.join(" ")).toMatch(/Unrecognized/);
    const huge = await createCreativeFromUpload({ walletAddress: wallet, placementId: "AD", bytes: await png(4000, 2250), filename: "big.png" });
    expect(huge.status).toBe("VALID");
    expect(huge.width).toBeLessThanOrEqual(3840);
  });

  it("refuses a still image where only video can play", async () => {
    await expect(createCreativeFromUpload({ walletAddress: wallet, placementId: "SHOW", bytes: await png(), filename: "x.png" })).resolves.toMatchObject({ status: "INVALID" });
  });
});

describe("submissions by link", () => {
  it("accepts a linked stream, measures it, and commits to the URL on chain", async () => {
    serveLink({ durationSec: 1234.5 });
    try {
      const c = await createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "https://cdn.example.com/film.m3u8" });
      expect(c.status).toBe("VALID");
      expect(c.type).toBe("VIDEO");
      expect(Number(c.durationSec)).toBeCloseTo(1234.5, 1);
      expect(c.url).toBe("https://cdn.example.com/film.m3u8");
      // The link itself is what the buyer signs for, so the hash is over the URL.
      expect(c.creativeHash).toBe(keccak256(toHex(Buffer.from("https://cdn.example.com/film.m3u8", "utf8"))));
      expect((c.metadata as { source?: string }).source).toBe("link");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses anything longer than the surface sells", async () => {
    // 30 minutes is the show limit; the spot is 30 seconds.
    serveLink({ durationSec: 2400 });
    try {
      await expect(createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "https://cdn.example.com/long.m3u8" })).rejects.toMatchObject({ status: 400 });
      await expect(createLinkCreative({ walletAddress: wallet, placementId: "AD", url: "https://cdn.example.com/long.m3u8" })).rejects.toMatchObject({ status: 400 });
    } finally {
      vi.unstubAllGlobals();
    }
    serveLink({ durationSec: 25 });
    try {
      const spot = await createLinkCreative({ walletAddress: wallet, placementId: "AD", url: "https://cdn.example.com/spot.m3u8" });
      expect(spot.status).toBe("VALID");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses watch pages, plain http and anything that is not video", async () => {
    await expect(createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "https://www.youtube.com/watch?v=abc" })).rejects.toThrow(/YouTube/);
    await expect(createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "http://cdn.example.com/x.mp4" })).rejects.toThrow(/https/);
    serveLink({ contentType: "text/html" });
    try {
      await expect(createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "https://cdn.example.com/page" })).rejects.toThrow(/not video/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses a live playlist: a run needs a known length", async () => {
    // No #EXT-X-ENDLIST: the playlist is still being written, so it has no length.
    serveLink({ body: "#EXTM3U\n#EXT-X-TARGETDURATION:6\n" });
    try {
      await expect(createLinkCreative({ walletAddress: wallet, placementId: "SHOW", url: "https://cdn.example.com/live.m3u8" })).rejects.toThrow(/live or incomplete/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("quotes and holds", () => {
  it("issues an EIP-712 quote at the surface's current ask and locks the surface", async () => {
    const creative = await showLink(wallet, "a");
    const campaign = await createCampaign({ walletAddress: wallet, placementId: "SHOW", displayName: "Test brand", creativeId: creative.id });
    expect(campaign.status).toBe("READY_TO_PURCHASE");

    const before = await getSurfaceState(await placement("SHOW"));
    expect(before.forSale).toBe(true);
    expect(before.occupant).toBeNull();

    const q = await createQuote({ campaignId: campaign.id, walletAddress: wallet });
    // The quote is the ask, to the wei.
    expect(q.amountWei).toBe(before.askWei);
    expect(BigInt(q.amountWei)).toBeGreaterThan(0n);

    const ok = await verifyTypedData({
      address: quoteSignerAddress(),
      domain: eip712Domain(31337, q.quote.contract),
      types: quoteTypes,
      primaryType: "Quote",
      message: { quoteId: q.quote.quoteId, buyer: q.quote.buyer, placementId: q.quote.placementId, creativeHash: q.quote.creativeHash, startAt: BigInt(q.quote.startAt), endAt: BigInt(q.quote.endAt), paymentToken: q.quote.paymentToken, amount: BigInt(q.quote.amount), expiresAt: BigInt(q.quote.expiresAt), nonce: BigInt(q.quote.nonce) },
      signature: q.quote.signature,
    });
    expect(ok).toBe(true);
    expect(q.quote.creativeHash).toBe(creative.creativeHash);
    // startAt/endAt on chain are the guaranteed runtime, not a booked slot.
    expect(Number(q.quote.endAt) - Number(q.quote.startAt)).toBe(q.guaranteedSeconds);

    const hold = await activeHold("show", serverNow());
    expect(hold).not.toBeNull();
    expect(hold!.campaignId).toBe(campaign.id);
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AWAITING_PAYMENT");
    expect((await getSurfaceState(await placement("SHOW"))).status).toBe("HELD");
  });

  it("refuses a limit below the ask instead of quietly charging more", async () => {
    const cr = await createCreativeFromUpload({ walletAddress: wallet, placementId: "AD", bytes: await png(512, 512), filename: "spot.png" });
    const c = await createCampaign({ walletAddress: wallet, placementId: "AD", displayName: "Limit", creativeId: cr.id });
    const state = await getSurfaceState(await placement("AD"));
    await expect(createQuote({ campaignId: c.id, walletAddress: wallet, maxPriceWei: BigInt(state.askWei) - 1n })).rejects.toMatchObject({ status: 409 });
    await expect(createQuote({ campaignId: c.id, walletAddress: wallet, maxPriceWei: BigInt(state.askWei) })).resolves.toBeTruthy();
  });

  it("lets only one buyer hold a surface at a time", async () => {
    const c1 = await createCampaign({ walletAddress: wallet, placementId: "AD", displayName: "A", creativeId: (await createCreativeFromUpload({ walletAddress: wallet, placementId: "AD", bytes: await png(), filename: "a2.png" })).id });
    await createQuote({ campaignId: c1.id, walletAddress: wallet });
    const other = "0x000000000000000000000000000000000000beef" as Address;
    const c2 = await createCampaign({ walletAddress: other, placementId: "AD", displayName: "B", creativeId: (await createCreativeFromUpload({ walletAddress: other, placementId: "AD", bytes: await png(), filename: "b.png" })).id });
    await expect(createQuote({ campaignId: c2.id, walletAddress: other })).rejects.toMatchObject({ status: 409 });
    expect((await getSurfaceState(await placement("AD"))).status).toBe("HELD");
  });

  it("serialises concurrent quotes for the same surface – exactly one wins", async () => {
    const campaigns = await Promise.all(
      [0, 1, 2, 3].map(async (i) => {
        const w = `0x00000000000000000000000000000000000000${(10 + i).toString(16).padStart(2, "0")}` as Address;
        const cr = await createCreativeFromUpload({ walletAddress: w, placementId: "AD", bytes: await png(1600, 900), filename: `c${i}.png` });
        return { w, c: await createCampaign({ walletAddress: w, placementId: "AD", displayName: `Racer ${i}`, creativeId: cr.id }) };
      }),
    );
    const results = await Promise.allSettled(campaigns.map(({ w, c }) => createQuote({ campaignId: c.id, walletAddress: w })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as HttpError).status === 409)).toHaveLength(3);
  });

  it("expires a quote and puts the surface back on the market", async () => {
    const cr = await showLink(wallet, "expiring");
    const c = await createCampaign({ walletAddress: wallet, placementId: "SHOW", displayName: "Expiring", creativeId: cr.id });
    await createQuote({ campaignId: c.id, walletAddress: wallet });
    expect(await expireQuotes(serverNow())).toBe(0);
    expect(await expireQuotes(addSeconds(serverNow(), 200))).toBeGreaterThanOrEqual(1);
    expect((await getCampaignDetail(c.id))!.campaign.status).toBe("READY_TO_PURCHASE");
    expect(await activeHold("show", addSeconds(serverNow(), 200))).toBeNull();
  });
});

describe("payment, occupancy and takeover", () => {
  it("authorizes only an event that matches every server-signed payment fact", async () => {
    chainMock.blockNumber = 102n;
    const creative = await showLink(wallet, "fully-checked");
    const campaign = await createCampaign({ walletAddress: wallet, placementId: "SHOW", displayName: "Verified buyer", creativeId: creative.id });
    const issued = await createQuote({ campaignId: campaign.id, walletAddress: wallet });
    const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, issued.quote.quoteId));
    const otherWallet = "0x000000000000000000000000000000000000beef" as Address;
    const otherBytes = keccak256(toHex("not-the-signed-value"));

    const mismatches = [
      purchasedLog({ ...quote, walletAddress: otherWallet }, ("0x" + "41".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, placementIdHash: otherBytes }, ("0x" + "42".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, creativeHash: otherBytes }, ("0x" + "43".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, paymentToken: "0x0000000000000000000000000000000000000001" }, ("0x" + "44".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, amountWei: (BigInt(quote.amountWei) + 1n).toString() }, ("0x" + "45".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, startsAt: new Date(quote.startsAt.getTime() + 1_000) }, ("0x" + "46".repeat(32)) as Hex, 101n),
      purchasedLog({ ...quote, endsAt: new Date(quote.endsAt.getTime() + 1_000) }, ("0x" + "47".repeat(32)) as Hex, 101n),
      { ...purchasedLog(quote, ("0x" + "48".repeat(32)) as Hex, 101n), address: otherWallet },
    ];

    for (const log of mismatches) {
      chainMock.logs = [log];
      expect(await pollAwaitingPayments()).toBe(0);
      expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AWAITING_PAYMENT");
      expect(await db().select().from(schema.payments).where(eq(schema.payments.campaignId, campaign.id))).toHaveLength(0);
    }

    chainMock.logs = [purchasedLog(quote, ("0x" + "49".repeat(32)) as Hex, 101n)];
    expect(await pollAwaitingPayments()).toBe(1);
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");
  });

  it("puts a paid campaign on the surface, then hands it to whoever pays more", async () => {
    const surfaceId = "SHOW";
    const lane = "show";

    /* ---- first buyer takes an empty surface ------------------------------ */
    const cr = await showLink(wallet, "first");
    const first = await createCampaign({ walletAddress: wallet, placementId: surfaceId, displayName: "First brand", creativeId: cr.id });
    const q1 = await createQuote({ campaignId: first.id, walletAddress: wallet });
    const [quoteRow] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, q1.quote.quoteId));

    // Wrong amount → ignored, nothing moves.
    chainMock.logs = [purchasedLog({ ...quoteRow, amountWei: (BigInt(quoteRow.amountWei) - 1n).toString() }, ("0x" + "11".repeat(32)) as Hex, 101n)];
    chainMock.blockNumber = 102n;
    expect(await pollAwaitingPayments()).toBe(0);
    expect((await getCampaignDetail(first.id))!.campaign.status).toBe("AWAITING_PAYMENT");

    // Matching event → on air immediately. There is no queue to wait in.
    chainMock.logs = [purchasedLog(quoteRow, ("0x" + "22".repeat(32)) as Hex, 101n)];
    expect(await pollAwaitingPayments()).toBe(1);
    let detail = await getCampaignDetail(first.id);
    expect(detail!.campaign.status).toBe("AIRING");
    expect(detail!.campaign.endsAt).toBeNull();
    expect(detail!.campaign.paidPriceWei).toBe(quoteRow.amountWei);
    expect(detail!.payment?.txHash).toBe("0x" + "22".repeat(32));

    // Replay of the same event → nothing changes.
    expect(await pollAwaitingPayments()).toBe(0);
    expect(await db().select().from(schema.payments).where(eq(schema.payments.campaignId, first.id))).toHaveLength(1);

    // The surface now reports its occupant and asks the takeover premium.
    const held = await getSurfaceState(await placement(surfaceId));
    expect(held.occupant?.campaignId).toBe(first.id);
    expect(held.status).toBe("PROTECTED");
    expect(held.forSale).toBe(false);
    expect(BigInt(held.askWei)).toBe(BigInt(quoteRow.amountWei) * 2n);
    expect((await getPublicQueue("MAIN")).onAir.some((e) => e.id === first.id)).toBe(true);

    /* ---- nobody can take it during the guaranteed runtime ---------------- */
    const rival = "0x00000000000000000000000000000000000000c0" as Address;
    const rivalCreative = await showLink(rival, "second");
    const second = await createCampaign({ walletAddress: rival, placementId: surfaceId, displayName: "Second brand", creativeId: rivalCreative.id });
    await expect(createQuote({ campaignId: second.id, walletAddress: rival })).rejects.toMatchObject({ status: 409 });

    /* ---- once the guarantee is over the ask decays and can be taken ------ */
    const guaranteeSec = (await placement(surfaceId)).auction.minHoldSeconds;
    setClockOffsetMs((guaranteeSec + 60) * 1000);
    const open = await getSurfaceState(await placement(surfaceId));
    expect(open.status).toBe("OPEN");
    expect(open.forSale).toBe(true);
    // Still strictly more than the occupant paid: a takeover is always a higher bid.
    expect(BigInt(open.askWei)).toBeGreaterThan(BigInt(quoteRow.amountWei));
    expect(BigInt(open.askWei)).toBeLessThan(BigInt(held.askWei));

    const q2 = await createQuote({ campaignId: second.id, walletAddress: rival });
    expect(BigInt(q2.amountWei)).toBeGreaterThan(BigInt(quoteRow.amountWei));
    expect(q2.outbids?.displayName).toBe("First brand");
    const [quoteRow2] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, q2.quote.quoteId));
    chainMock.logs = [purchasedLog(quoteRow2, ("0x" + "33".repeat(32)) as Hex, 103n)];
    chainMock.blockNumber = 104n;
    expect(await pollAwaitingPayments()).toBe(1);

    /* ---- the first buyer is off the surface, with an honest receipt ------ */
    detail = await getCampaignDetail(first.id);
    expect(detail!.campaign.status).toBe("COMPLETED");
    expect(detail!.campaign.endedReason).toBe("OUTBID");
    expect(detail!.campaign.durationSec).toBeGreaterThanOrEqual(guaranteeSec);
    expect(detail!.airLog).not.toBeNull();
    expect(detail!.airLog!.txHash).toBe("0x" + "22".repeat(32));
    expect(detail!.airLog!.actualEnd).not.toBeNull();

    const after = await getSurfaceState(await placement(surfaceId));
    expect(after.occupant?.campaignId).toBe(second.id);
    expect(after.lastClearingPriceWei).toBe(quoteRow2.amountWei);
    expect((await getCampaignDetail(second.id))!.campaign.status).toBe("AIRING");
    expect(await activeHold(lane, serverNow())).toBeNull();

    /* ---- withdrawing hands the surface back and restarts the descent ----- */
    await withdrawRun(second.id, { type: "WALLET", id: rival });
    const free = await getSurfaceState(await placement(surfaceId));
    expect(free.occupant).toBeNull();
    expect(free.forSale).toBe(true);
    // The descent restarts from what the surface last cleared at and falls to the floor.
    expect(free.anchorWei).toBe(quoteRow2.amountWei);
    expect(free.floorWei).toBe((await placement(surfaceId)).auction.floorPriceWei);
    expect((await getCampaignDetail(second.id))!.campaign.endedReason).toBe("WITHDRAWN");

    setClockOffsetMs(0);
    chainMock.logs = [];
  });

  it("shows every surface with its ask on the board", async () => {
    const board = await getBoard("MAIN");
    // The picture (a show or the break on it) plus the two panels beside it.
    expect(board.rows).toHaveLength(4);
    expect(board.rows.filter((r) => r.placement.ownsMainStream)).toHaveLength(2);
    expect(board.rows.filter((r) => r.placement.kind === "panel")).toHaveLength(2);
    // Everything opens at the same 0.01 and demand takes it from there.
    for (const row of board.rows) expect(row.placement.auction.openingPriceWei).toBe((10n ** 16n).toString());
    for (const row of board.rows) {
      expect(BigInt(row.surface.askWei)).toBeGreaterThan(0n);
      expect(row.surface.placementId).toBe(row.placement.id);
      if (row.occupant) expect(row.surface.occupant?.campaignId).toBe(row.occupant.id);
    }
    const commercial = board.rows.find((r) => r.placement.id === "AD");
    expect(commercial).toBeTruthy();
    expect(commercial!.placement.availability.inventoryMode).toBe("AD_BREAK");
    expect(commercial!.placement.ownsMainStream).toBe(true);
  });
});

describe("synchronized programming", () => {
  it("keeps a rolling horizon and computes the same offset from the server clock", async () => {
    await ensureScheduleHorizon("MAIN", 12);
    const s1 = await getBroadcastState("MAIN");
    expect(s1.now).not.toBeNull();
    expect(s1.next).not.toBeNull();
    const t0 = serverNow().getTime();
    setClockOffsetMs(90_000);
    const s2 = await getBroadcastState("MAIN");
    if (s2.now?.id === s1.now?.id) {
      expect(Math.round(s2.offsetSec - s1.offsetSec)).toBeGreaterThanOrEqual(89);
    } else {
      expect(new Date(s2.now!.startsAt).getTime()).toBeGreaterThan(t0 - 1);
    }
    setClockOffsetMs(0);
  });

  it("inserts a manual live block, trims the timeline and returns to schedule", async () => {
    const before = await getBroadcastState("MAIN");
    const block = await insertManualBlock({ channelId: "MAIN", type: "LIVE_HLS", title: "Breaking", mediaUrl: "https://example.com/live.m3u8", durationSec: 120 });
    const during = await getBroadcastState("MAIN");
    expect(during.now?.id).toBe(block.id);
    expect(during.now?.type).toBe("LIVE_HLS");
    setClockOffsetMs(121_000);
    const after = await getBroadcastState("MAIN");
    expect(after.now?.id).not.toBe(block.id);
    expect(after.now).not.toBeNull();
    setClockOffsetMs(0);
    expect(before.now).not.toBeNull();
  });
});
