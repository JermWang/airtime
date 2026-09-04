ALTER TABLE "reservations" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "min_duration_sec";--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "max_duration_sec";--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "duration_options_sec";--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "base_price_wei";--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "price_multiplier_bps";--> statement-breakpoint
ALTER TABLE "placements" DROP COLUMN "pricing_rules";