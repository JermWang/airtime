CREATE TYPE "public"."activation_status" AS ENUM('SCHEDULED', 'ACTIVE', 'ENDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('ADMIN', 'SYSTEM', 'WALLET');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('OWNER', 'OPERATOR', 'MODERATOR');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'VALIDATING', 'READY_TO_PURCHASE', 'AWAITING_PAYMENT', 'PAID', 'QUEUED', 'AIRING', 'COMPLETED', 'REJECTED', 'REFUNDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('PENDING', 'VALID', 'INVALID', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."creative_type" AS ENUM('IMAGE', 'VIDEO', 'TEXT', 'LOGO');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('VOD', 'LIVE_HLS');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."placement_type" AS ENUM('FULLSCREEN', 'OVERLAY', 'ENVIRONMENT', 'SPONSORSHIP');--> statement-breakpoint
CREATE TYPE "public"."program_block_type" AS ENUM('VOD', 'LIVE_HLS', 'AD_BREAK', 'BUMPER');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('ACTIVE', 'EXPIRED', 'CONSUMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('HELD', 'CONFIRMED', 'RELEASED');--> statement-breakpoint
CREATE TABLE "ad_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"placement_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" "activation_status" DEFAULT 'SCHEDULED' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'OPERATOR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "air_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_id" uuid,
	"placement_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"tx_hash" text,
	"block_number" bigint,
	"chain_id" integer,
	"wallet_address" text NOT NULL,
	"amount_wei" numeric(78, 0),
	"payment_token" text,
	"playback_status" text NOT NULL,
	"analytics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "air_logs_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activation_id" uuid,
	"campaign_id" uuid NOT NULL,
	"placement_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"type" text NOT NULL,
	"value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"channel_id" text NOT NULL,
	"placement_id" text NOT NULL,
	"creative_id" uuid,
	"display_name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"duration_sec" integer,
	"fit" text DEFAULT 'FIT' NOT NULL,
	"click_url" text,
	"active_quote_id" text,
	"payment_id" uuid,
	"rejection_reason" text,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"auto_fill" boolean DEFAULT true NOT NULL,
	"auto_fill_ad_break_sec" integer DEFAULT 120 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"type" "creative_type" NOT NULL,
	"status" "creative_status" DEFAULT 'PENDING' NOT NULL,
	"original_filename" text,
	"storage_key" text,
	"url" text,
	"poster_url" text,
	"mime_type" text,
	"extension" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"duration_sec" numeric(10, 3),
	"has_audio" boolean DEFAULT false NOT NULL,
	"codec" text,
	"content_hash" text NOT NULL,
	"creative_hash" text NOT NULL,
	"text_content" text,
	"click_url" text,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"moderation_note" text,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"hls_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"quote_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"buyer" text NOT NULL,
	"payment_token" text NOT NULL,
	"amount_wei" numeric(78, 0) NOT NULL,
	"status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refund_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "placement_type" NOT NULL,
	"kind" text NOT NULL,
	"aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"media_types" jsonb DEFAULT '["IMAGE"]'::jsonb NOT NULL,
	"min_duration_sec" integer NOT NULL,
	"max_duration_sec" integer NOT NULL,
	"duration_options_sec" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_price_wei" numeric(78, 0) NOT NULL,
	"price_multiplier_bps" integer DEFAULT 10000 NOT NULL,
	"pricing_rules" jsonb NOT NULL,
	"availability" jsonb NOT NULL,
	"lane" text NOT NULL,
	"mesh_name" text,
	"transform" jsonb,
	"material" jsonb NOT NULL,
	"max_width" integer DEFAULT 1920 NOT NULL,
	"max_height" integer DEFAULT 1080 NOT NULL,
	"max_file_bytes" integer DEFAULT 8388608 NOT NULL,
	"allows_audio" boolean DEFAULT false NOT NULL,
	"allows_click_through" boolean DEFAULT false NOT NULL,
	"requires_moderation" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"program_id" uuid,
	"live_source_id" uuid,
	"type" "program_block_type" NOT NULL,
	"title" text NOT NULL,
	"media_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"media_type" "media_type" DEFAULT 'VOD' NOT NULL,
	"media_url" text NOT NULL,
	"poster_url" text,
	"duration_sec" integer NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"in_rotation" boolean DEFAULT true NOT NULL,
	"is_dev_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"placement_id" text NOT NULL,
	"placement_id_hash" text NOT NULL,
	"creative_hash" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"payment_token" text NOT NULL,
	"amount_wei" numeric(78, 0) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"nonce" numeric(78, 0) NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"signature" text NOT NULL,
	"price_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "quote_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_at_block" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" text NOT NULL,
	"lane" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"quote_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'HELD' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"last_chain_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_activations" ADD CONSTRAINT "ad_activations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "air_logs" ADD CONSTRAINT "air_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_activation_id_ad_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "public"."ad_activations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sources" ADD CONSTRAINT "live_sources_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_blocks" ADD CONSTRAINT "program_blocks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_blocks" ADD CONSTRAINT "program_blocks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_blocks" ADD CONSTRAINT "program_blocks_live_source_id_live_sources_id_fk" FOREIGN KEY ("live_source_id") REFERENCES "public"."live_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_activations_status_idx" ON "ad_activations" USING btree ("status","scheduled_start");--> statement-breakpoint
CREATE INDEX "analytics_campaign_idx" ON "analytics_events" USING btree ("campaign_id","type");--> statement-breakpoint
CREATE INDEX "campaigns_status_start_idx" ON "campaigns" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "campaigns_wallet_idx" ON "campaigns" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "campaigns_placement_idx" ON "campaigns" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "creatives_wallet_idx" ON "creatives" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_quote_unique" ON "payments" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tx_log_unique" ON "payments" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "program_blocks_channel_start_idx" ON "program_blocks" USING btree ("channel_id","starts_at");--> statement-breakpoint
CREATE INDEX "quotes_status_expires_idx" ON "quotes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservations_lane_window_idx" ON "reservations" USING btree ("lane","status","starts_at","ends_at");