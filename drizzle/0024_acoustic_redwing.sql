CREATE TABLE "evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"director_job_id" text,
	"idempotency_key" varchar(255) NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" text,
	"rubric" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"scores" jsonb,
	"overall_score" integer,
	"passed" boolean,
	"model" varchar(96),
	"gpu_seconds" integer DEFAULT 0 NOT NULL,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"cost_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_director_job_id_jobs_id_fk" FOREIGN KEY ("director_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluations_org_idx" ON "evaluations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_org_idempotency_uq" ON "evaluations" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "evaluations_subject_idx" ON "evaluations" USING btree ("subject_type","subject_id");