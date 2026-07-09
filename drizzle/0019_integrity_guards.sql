ALTER TABLE "swarm_runs" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_payment_credit_uq" ON "usage_ledger_entries" USING btree ("ref_id") WHERE "usage_ledger_entries"."kind" = 'payment' AND "usage_ledger_entries"."ref_id" IS NOT NULL;--> statement-breakpoint

-- Append-only for execution logs (reuses the guard function from 0017): nothing
-- updates or deletes logs; make that structural.
DROP TRIGGER IF EXISTS execution_logs_append_only ON execution_logs;--> statement-breakpoint
CREATE TRIGGER execution_logs_append_only
  BEFORE UPDATE OR DELETE ON execution_logs
  FOR EACH ROW EXECUTE FUNCTION swarms_forbid_mutation();--> statement-breakpoint

-- Financial receipts are immutable once issued, with ONE exception: the job
-- binding (job_id) may be set after the fact by bindReceiptToJob. Block DELETE
-- outright and block any UPDATE that touches a financial/identity column, so the
-- settlement record (tx_ref, amount, attempt, etc.) can never be rewritten.
CREATE OR REPLACE FUNCTION swarms_receipts_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only table x402_payment_receipts: DELETE is not permitted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF ROW(NEW.organization_id, NEW.payment_attempt_id, NEW.amount_minor, NEW.currency,
         NEW.tx_ref, NEW.binding, NEW.provider_ref, NEW.breakdown, NEW.issued_at, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.organization_id, OLD.payment_attempt_id, OLD.amount_minor, OLD.currency,
         OLD.tx_ref, OLD.binding, OLD.provider_ref, OLD.breakdown, OLD.issued_at, OLD.created_at) THEN
    RAISE EXCEPTION 'append-only table x402_payment_receipts: financial columns are immutable (only job_id may be bound after issuance)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS x402_payment_receipts_append_only ON x402_payment_receipts;--> statement-breakpoint
CREATE TRIGGER x402_payment_receipts_append_only
  BEFORE UPDATE OR DELETE ON x402_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION swarms_receipts_append_only();
