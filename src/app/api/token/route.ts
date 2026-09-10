import { getStonkfunSnapshot } from "@/server/stonkfun";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await getStonkfunSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
