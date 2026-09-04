"use client";

import { use } from "react";
import Link from "next/link";
import { PageFrame } from "@/components/hud/PageFrame";
import { PurchaseFlow } from "@/components/airtime/PurchaseFlow";
import { Preview2D } from "@/components/airtime/Preview2D";
import { usePlacements } from "@/lib/hooks";

/** Conventional purchase page with a WYSIWYG preview. Works without WebGL. */
export default function PlacementPage({ params }: { params: Promise<{ placementId: string }> }) {
  const { placementId } = use(params);
  const { data, isLoading } = usePlacements();
  const placement = data?.placements.find((p) => p.id === placementId);
  return (
    <PageFrame wide>
      {isLoading && <div className="label">Loading placement…</div>}
      {!isLoading && !placement && (
        <div className="glass rounded-lg p-6">
          <div className="text-ink-100">Placement not found or inactive.</div>
          <Link href="/airtime" className="btn mt-3">
            Browse inventory
          </Link>
        </div>
      )}
      {placement && (
        <div className="grid gap-6 md:grid-cols-[1fr_420px]">
          <div>
            <Preview2D placement={placement} />
            {placement.type === "ENVIRONMENT" && (
              <div className="mt-3 text-[11.5px] text-ink-400">
                See this surface inside the studio:{" "}
                <Link href="/" className="text-signal">
                  open the station
                </Link>{" "}
                and choose Buy airtime.
              </div>
            )}
          </div>
          <div className="glass-strong rounded-xl p-4">
            <PurchaseFlow placement={placement} />
          </div>
        </div>
      )}
    </PageFrame>
  );
}
