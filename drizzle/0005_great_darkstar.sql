ALTER TABLE "swarm_agents" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "swarm_agents" ADD COLUMN "error" jsonb;--> statement-breakpoint
ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;