ALTER TABLE "skill_permissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "skill_permissions" CASCADE;--> statement-breakpoint
DROP TABLE "skill_versions" CASCADE;--> statement-breakpoint
DROP TABLE "skills" CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_skill_version_id_skill_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "worker_runs" DROP CONSTRAINT IF EXISTS "worker_runs_skill_version_id_skill_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "swarm_agents" DROP CONSTRAINT IF EXISTS "swarm_agents_skill_version_id_skill_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "skill_version_id";--> statement-breakpoint
ALTER TABLE "worker_runs" DROP COLUMN "skill_version_id";--> statement-breakpoint
ALTER TABLE "swarm_agents" DROP COLUMN "skill_version_id";--> statement-breakpoint
DROP TYPE "public"."review_status";--> statement-breakpoint
DROP TYPE "public"."risk_level";--> statement-breakpoint
DROP TYPE "public"."runner_type";--> statement-breakpoint
DROP TYPE "public"."skill_version_status";--> statement-breakpoint
DROP TYPE "public"."skill_visibility";