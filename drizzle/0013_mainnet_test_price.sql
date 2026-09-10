-- Temporary 0.01 SOL floor for the authorized mainnet payment test.
-- Existing payments, accepted quotes, and active campaigns retain their recorded amounts.
UPDATE placements SET auction = jsonb_set(jsonb_set(auction, '{openingPriceWei}', '"10000000"'::jsonb), '{floorPriceWei}', '"10000000"'::jsonb);
--> statement-breakpoint
UPDATE showcase_creatives SET sublabel = replace(sublabel, '0.5 SOL', '0.01 SOL') WHERE sublabel LIKE '%0.5 SOL%';
