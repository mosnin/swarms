ALTER TABLE "x402_payment_attempts" ADD COLUMN "binding" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "x402_payment_receipts" ADD COLUMN "binding" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "x402_receipts_org_txref_uq" ON "x402_payment_receipts" USING btree ("organization_id","tx_ref");--> statement-breakpoint
CREATE INDEX "x402_receipts_binding_idx" ON "x402_payment_receipts" USING btree ("organization_id","binding");