"use client";

import { use } from "react";
import Link from "next/link";
import { PageFrame } from "@/components/hud/PageFrame";
import { PurchaseFlow } from "@/components/airtime/PurchaseFlow";
import { Preview2D } from "@/components/airtime/Preview2D";
import { CampaignCheckout, canResumeCampaign } from "@/components/airtime/CampaignCheckout";
import { useMyCampaigns, usePlacements, useSession } from "@/lib/hooks";

/** Conventional purchase page with a WYSIWYG preview. Works without WebGL. */
export default function PlacementPage({ params }: { params: Promise<{ placementId: string }> }) {
  const { placementId } = use(params);
  const { data, isLoading } = usePlacements();
  const session = useSession();
  const mine = useMyCampaigns(Boolean(session.data?.wallet));
  const drafts = mine.data?.campaigns.filter(c => c.placement.id === placementId && canResumeCampaign(c)) ?? [];
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
            {drafts.length > 0 && <details className="mb-4 rounded-lg border border-white/10 p-3">
              <summary className="cursor-pointer text-sm text-ink-100">Continue a saved ad ({drafts.length})</summary>
              {drafts.map(c => <div key={c.id} className="mt-3 border-t border-white/10 pt-3">
                <div className="text-sm text-ink-100">{c.displayName}</div>
                <CampaignCheckout campaign={c} />
              </div>)}
            </details>}
            <PurchaseFlow placement={placement} />
          </div>
        </div>
      )}
    </PageFrame>
  );
}
