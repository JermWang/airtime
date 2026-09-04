import { route } from "@/server/route";
import { json } from "@/server/http";
import { serverNowMs, clockOffsetMs } from "@/server/time/clock";
import { activeChainEnv } from "@/lib/chain/chains";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return json({ serverTime: serverNowMs(), simulatedOffsetMs: clockOffsetMs(), chainEnv: activeChainEnv() });
});
