import { route } from "@/server/route";
import { json } from "@/server/http";
import { getWalletSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const wallet = await getWalletSession();
  return json({ wallet: wallet ? { address: wallet.address, chainId: wallet.chainId } : null });
});
