-- Agent-workforce swarms are spawned directly from tasks (no template), so a
-- swarm run no longer requires a template reference.
ALTER TABLE "swarm_runs" ALTER COLUMN "swarm_template_id" DROP NOT NULL;
