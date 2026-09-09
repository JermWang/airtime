-- Raise configured floors without rewriting historical payments or running campaigns.
UPDATE placements SET auction = jsonb_set(jsonb_set(auction, '{openingPriceWei}', to_jsonb(GREATEST((auction->>'openingPriceWei')::numeric, 500000000)::text)), '{floorPriceWei}', to_jsonb(GREATEST((auction->>'floorPriceWei')::numeric, 500000000)::text));
--> statement-breakpoint
UPDATE showcase_creatives SET sublabel = replace(sublabel, '0.01 SOL', '0.5 SOL') WHERE sublabel LIKE '%0.01 SOL%';

