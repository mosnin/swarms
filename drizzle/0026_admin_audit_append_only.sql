-- The platform-admin audit trail must be as tamper-proof as the per-org audit
-- trail it sits alongside (see 0017_append_only_guard.sql): reuse the same
-- `swarms_forbid_mutation()` guard function so UPDATE/DELETE on
-- admin_audit_log is structurally impossible, not just an application-layer
-- convention.
DROP TRIGGER IF EXISTS admin_audit_log_append_only ON admin_audit_log;
--> statement-breakpoint
CREATE TRIGGER admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION swarms_forbid_mutation();
