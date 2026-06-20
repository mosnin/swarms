ALTER TABLE "worker_runs" ADD COLUMN "skill_version_id" text;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "runner_type" varchar(32);--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "input" jsonb;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "error" jsonb;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "cost_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD COLUMN "cost_currency" varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD CONSTRAINT "worker_runs_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;