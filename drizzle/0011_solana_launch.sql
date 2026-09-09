-- Keep a reversible snapshot of the former market before resetting its live state.
CREATE TABLE IF NOT EXISTS chain_migration_snapshots (
  migration text NOT NULL, table_name text NOT NULL, row_id text NOT NULL, data jsonb NOT NULL,
  PRIMARY KEY (migration, table_name, row_id)
);
--> statement-breakpoint
INSERT INTO chain_migration_snapshots SELECT 'solana-launch', 'placements', id, to_jsonb(p) FROM placements p ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO chain_migration_snapshots SELECT 'solana-launch', 'campaigns', id::text, to_jsonb(c) FROM campaigns c ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO chain_migration_snapshots SELECT 'solana-launch', 'reservations', id::text, to_jsonb(r) FROM reservations r ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO chain_migration_snapshots SELECT 'solana-launch', 'ad_activations', id::text, to_jsonb(a) FROM ad_activations a ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE ad_activations SET status = 'ENDED', ended_at = now() WHERE status IN ('SCHEDULED', 'ACTIVE');
--> statement-breakpoint
UPDATE campaigns SET status = 'COMPLETED', ends_at = now(), ended_reason = 'REMOVED', updated_at = now() WHERE status IN ('PAID', 'QUEUED', 'AIRING');
--> statement-breakpoint
UPDATE reservations SET status = 'RELEASED', ends_at = now() WHERE status IN ('HELD', 'CONFIRMED');
--> statement-breakpoint
INSERT INTO chain_migration_snapshots SELECT 'solana-launch', 'quotes', id, to_jsonb(q) FROM quotes q ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE quotes SET status = 'CANCELLED' WHERE status = 'ACTIVE';
--> statement-breakpoint
UPDATE placements SET current_campaign_id = NULL, last_clearing_price_wei = 0, ask_reset_at = now(),
 auction = jsonb_set(jsonb_set(auction, '{openingPriceWei}', '"10000000"'), '{floorPriceWei}', '"10000000"');
--> statement-breakpoint
ALTER TABLE treasury_entries ALTER COLUMN asset_symbol SET DEFAULT 'SOL';

--> statement-breakpoint
ALTER TABLE quotes ADD COLUMN tx_payload text, ADD COLUMN tx_blockhash text, ADD COLUMN tx_last_valid_block_height bigint, ADD COLUMN tx_error text;
