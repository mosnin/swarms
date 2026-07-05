-- Append-only enforcement at the database level for the money ledger and the
-- audit trail. These tables are written by INSERT only in application code;
-- this trigger makes UPDATE/DELETE structurally impossible so a future code
-- path (or a direct connection) can never silently rewrite financial history.
-- Corrections must be made by appending compensating entries.
CREATE OR REPLACE FUNCTION swarms_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % is not permitted (append a compensating row instead)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS usage_ledger_entries_append_only ON usage_ledger_entries;
--> statement-breakpoint
CREATE TRIGGER usage_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON usage_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION swarms_forbid_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION swarms_forbid_mutation();
