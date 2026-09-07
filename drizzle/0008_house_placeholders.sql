-- House placeholders: media the station itself puts on a surface nobody has
-- booked, alongside the text-only showcase cards that were already here.
--
-- `slug` is a stable key so the seed can ship a placeholder and later fill in
-- its artwork without duplicating the row. Existing rows are keyed off their id
-- so nothing an operator already has is disturbed.
ALTER TABLE "showcase_creatives" ADD COLUMN "slug" text;--> statement-breakpoint
-- The one card the seed has always shipped adopts its seed slug, so it is
-- refreshed rather than duplicated. Anything an operator added keeps its id.
UPDATE "showcase_creatives" SET "slug" = 'airtime-buy-the-screen'
WHERE "id" = (SELECT "id" FROM "showcase_creatives" WHERE "headline" = 'Buy the screen' ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
UPDATE "showcase_creatives" SET "slug" = "id"::text WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "showcase_creatives" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "showcase_creatives" ADD CONSTRAINT "showcase_creatives_slug_unique" UNIQUE("slug");--> statement-breakpoint

ALTER TABLE "showcase_creatives" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "showcase_creatives" ADD COLUMN "media_type" "creative_type";--> statement-breakpoint
ALTER TABLE "showcase_creatives" ADD COLUMN "poster_url" text;--> statement-breakpoint
ALTER TABLE "showcase_creatives" ADD COLUMN "duration_sec" integer;
