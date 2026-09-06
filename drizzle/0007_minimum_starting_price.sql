-- Every surface starts at 0.01 ETH and nothing is ever asked for less.
--
-- The price curve clamps to the minimum on its own, so this does not change what
-- any surface costs; it lifts stored rules written before the rule existed so the
-- control room shows the number the station actually asks. Prices only ever go
-- up here: a placement already configured above the minimum is left alone.
UPDATE "placements"
SET "auction" = "auction"
  || jsonb_build_object('openingPriceWei', '10000000000000000')
WHERE ("auction" ->> 'openingPriceWei')::numeric < 10000000000000000;--> statement-breakpoint

UPDATE "placements"
SET "auction" = "auction"
  || jsonb_build_object('floorPriceWei', '10000000000000000')
WHERE ("auction" ->> 'floorPriceWei')::numeric < 10000000000000000;
