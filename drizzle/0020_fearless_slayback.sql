CREATE TABLE "simulation_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"simulation_run_id" text NOT NULL,
	"persona_name" varchar(255) NOT NULL,
	"role" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"director_job_id" text,
	"idempotency_key" varchar(255) NOT NULL,
	"mode" varchar(16) NOT NULL,
	"framework_id" varchar(64),
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"base_fee_minor" bigint DEFAULT 0 NOT NULL,
	"gpu_seconds" integer DEFAULT 0 NOT NULL,
	"cost_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulation_agents" ADD CONSTRAINT "simulation_agents_simulation_run_id_simulation_runs_id_fk" FOREIGN KEY ("simulation_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_director_job_id_jobs_id_fk" FOREIGN KEY ("director_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulation_agents_run_idx" ON "simulation_agents" USING btree ("simulation_run_id");--> statement-breakpoint
CREATE INDEX "simulation_runs_org_idx" ON "simulation_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulation_runs_org_idempotency_uq" ON "simulation_runs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "simulation_runs_org_status_created_idx" ON "simulation_runs" USING btree ("organization_id","status","created_at");