ALTER TABLE "swarm_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- DROP TABLE ... CASCADE already removes the dependent FK on swarm_runs, so the
-- constraint drop must be idempotent (it would otherwise error: does not exist).
DROP TABLE "swarm_templates" CASCADE;--> statement-breakpoint
ALTER TABLE "swarm_runs" DROP CONSTRAINT IF EXISTS "swarm_runs_swarm_template_id_swarm_templates_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "swarm_runs_template_idx";--> statement-breakpoint
CREATE INDEX "swarm_runs_org_idx" ON "swarm_runs" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "swarm_runs" DROP COLUMN "swarm_template_id";