CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channel_created_idx" ON "chat_messages" ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_wallet_created_idx" ON "chat_messages" ("wallet_address","created_at");
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tx_hint" text;
