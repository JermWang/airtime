-- Buybacks and burns of $AIRTIME, recorded in the same ledger as the rest of
-- the treasury's off-chain movements.
--
-- The quantity is kept in its own column rather than in `shares`: that one
-- counts Anduril pre-stock, and the two must never be summed together.
ALTER TYPE "treasury_entry_kind" ADD VALUE IF NOT EXISTS 'BUYBACK';--> statement-breakpoint
ALTER TYPE "treasury_entry_kind" ADD VALUE IF NOT EXISTS 'BURN';--> statement-breakpoint
ALTER TABLE "treasury_entries" ADD COLUMN "token_amount_wei" numeric(78, 0) DEFAULT '0' NOT NULL;
