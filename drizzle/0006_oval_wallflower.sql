ALTER TABLE "payments" ADD COLUMN "refund_tx_hash" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_block_number" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_log_index" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_refund_tx_log_unique" ON "payments" USING btree ("refund_tx_hash","refund_log_index");
