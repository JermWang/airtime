ALTER TABLE "campaigns" ADD COLUMN "guaranteed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "paid_price_wei" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ended_reason" text;--> statement-breakpoint
-- Existing surfaces need auction rules before the column can be NOT NULL. They
-- get a conservative descending curve (6 ETH opening, 0.6 ETH floor, six hours,
-- 2x takeover premium, 30 minutes of guaranteed runtime); an operator tunes each
-- surface from the control room afterwards. The default is dropped straight away
-- so new placements must state their own rules.
ALTER TABLE "placements" ADD COLUMN "auction" jsonb DEFAULT '{"openingPriceWei":"6000000000000000000","floorPriceWei":"600000000000000000","decaySeconds":21600,"takeoverPremiumBps":20000,"minIncrementBps":500,"minHoldSeconds":1800,"maxHoldSeconds":0}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ALTER COLUMN "auction" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "last_clearing_price_wei" numeric(78, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "ask_reset_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "current_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "max_creative_sec" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
-- The three fixed-length main-stream spots are replaced by one surface that owns
-- every commercial break for as long as its buyer holds it. Retired rather than
-- deleted so any historical campaign still resolves its placement.
UPDATE "placements" SET "is_active" = false WHERE "id" IN ('MAIN_COMMERCIAL_30', 'MAIN_COMMERCIAL_15', 'STATION_ID_BUMPER');
