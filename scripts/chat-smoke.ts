/**
 * Chat smoke test.
 *
 * Signs a wallet session with the server's own secret, then exercises the live
 * /api/chat endpoint the way a browser would: post, read back, and prove the
 * flood limits. Run against a dev server:
 *
 *   pnpm tsx scripts/chat-smoke.ts [baseUrl]
 */
import "./_env";
import { signSession, WALLET_COOKIE } from "../src/server/auth/session";

const base = process.argv[2] ?? "http://localhost:3200";
const wallet = "0x7099797f9b1e9c25a4a3d1e0d5f01d2a0a2b0c0d" as `0x${string}`;

async function main() {
  const token = await signSession({ kind: "wallet", address: wallet, chainId: 31337 }, 3600);
  const headers = {
    "content-type": "application/json",
    origin: base,
    cookie: `${WALLET_COOKIE}=${token}`,
  };

  const post = (body: string) => fetch(`${base}/api/chat`, { method: "POST", headers, body: JSON.stringify({ channel: "MAIN", body }) });
  const show = async (label: string, res: Response) => {
    const text = await res.text();
    console.log(`${label}: ${res.status} ${text.slice(0, 160)}`);
    return res.status;
  };

  console.log("--- posting as", wallet);
  await show("first message   ", await post("first message from the smoke test"));

  console.log("--- immediate second message should be refused (min gap)");
  await show("too fast        ", await post("a different message straight away"));

  console.log("--- waiting out the gap, then repeating myself");
  await new Promise((r) => setTimeout(r, 2500));
  await show("duplicate       ", await post("first message from the smoke test"));

  console.log("--- a real second message after the gap");
  await new Promise((r) => setTimeout(r, 2500));
  await show("second message  ", await post("second message, sent after the gap"));

  console.log("--- control characters and whitespace are stripped");
  await new Promise((r) => setTimeout(r, 2500));
  await show("sanitised       ", await post("  spaced​   out   text  "));

  console.log("--- anonymous post is refused");
  const anon = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ channel: "MAIN", body: "no wallet here" }) });
  await show("anonymous       ", anon);

  const read = await fetch(`${base}/api/chat?channel=MAIN`).then((r) => r.json() as Promise<{ messages: Array<{ wallet: string; body: string }> }>);
  console.log("--- room now holds", read.messages.length, "messages");
  for (const m of read.messages) console.log(`   ${m.wallet.slice(0, 8)}… ${JSON.stringify(m.body)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
