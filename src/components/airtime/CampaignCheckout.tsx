"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CampaignDto, type QuoteDto } from "@/lib/api";
import { usePlacements, useSession } from "@/lib/hooks";
import { useAccount } from "@/lib/solana-wallet";
import { PurchaseFlow } from "./PurchaseFlow";

export const canResumeCampaign = (c: CampaignDto) => !c.payment && ["DRAFT", "VALIDATING", "READY_TO_PURCHASE", "AWAITING_PAYMENT"].includes(c.status);

/** Resume the original campaign in place; never create a replacement purchase. */
export function CampaignCheckout({ campaign }: { campaign: CampaignDto }) {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const { address } = useAccount();
  const owner = session.data?.wallet?.address === campaign.wallet && address === campaign.wallet;
  if (!owner || !canResumeCampaign(campaign)) return null;
  return <div className="mt-3">
    {open ? <ResumeCheckout key={campaign.id} campaign={campaign} /> : (
      <button className="btn btn-primary w-full" onClick={() => setOpen(true)}>
        {campaign.creative ? "Continue to payment" : "Finish your ad"}
      </button>
    )}
  </div>;
}

function ResumeCheckout({ campaign }: { campaign: CampaignDto }) {
  const placements = usePlacements();
  const qc = useQueryClient();
  const quote = useQuery({
    queryKey: ["resume-quote", campaign.id, campaign.activeQuoteId],
    queryFn: async () => {
      try { return await api<QuoteDto & { paymentSubmitted: boolean }>(`/api/campaigns/${campaign.id}/quote`); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  const placement = placements.data?.placements.find(p => p.id === campaign.placement.id);
  if (placements.isLoading || quote.isLoading) return <p role="status" className="text-sm text-ink-300">Loading your checkout…</p>;
  if (quote.error || placements.error) return <div role="alert" className="text-sm text-ink-200">
    Could not load checkout. No payment was sent.
    <button className="btn mt-2" onClick={() => { void quote.refetch(); void placements.refetch(); }}>Try again</button>
  </div>;
  if (!placement) return <p className="text-sm text-ink-300">This surface is currently unavailable.</p>;
  if (quote.data?.paymentSubmitted) return <p role="status" className="text-sm text-ink-200">Payment submitted. The station is checking confirmation; do not pay again.</p>;
  return <PurchaseFlow placement={placement} initialCampaign={campaign} initialQuote={quote.data} compact onConfirmed={() => {
    void qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
    void qc.invalidateQueries({ queryKey: ["campaigns"] });
  }} />;
}
