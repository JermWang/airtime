CREATE TYPE "public"."treasury_entry_kind" AS ENUM('TAX_INFLOW', 'STOCK_PURCHASE', 'DISTRIBUTION');--> statement-breakpoint
CREATE TABLE "showcase_creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" text,
	"label" text NOT NULL,
	"headline" text NOT NULL,
	"sublabel" text,
	"accent" text DEFAULT '#ccff00' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "treasury_entry_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_wei" numeric(78, 0) DEFAULT '0' NOT NULL,
	"asset_symbol" text DEFAULT 'ETH' NOT NULL,
	"shares" numeric(30, 6) DEFAULT '0' NOT NULL,
	"price_per_share_wei" numeric(78, 0),
	"holders" integer,
	"tx_hash" text,
	"reference" text,
	"note" text,
	"created_by" text,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "showcase_creatives" ADD CONSTRAINT "showcase_creatives_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "treasury_entries_kind_idx" ON "treasury_entries" USING btree ("kind","occurred_at");