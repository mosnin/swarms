CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text,
	"swarm_run_id" text,
	"simulation_run_id" text,
	"created_by_user_id" text,
	"filename" varchar(512) NOT NULL,
	"content_type" varchar(128) DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"storage_provider" varchar(16) NOT NULL,
	"storage_key" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(128) DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" bigint NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_org_idx" ON "artifacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "artifacts_job_idx" ON "artifacts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "artifacts_org_created_idx" ON "artifacts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "object_blobs_key_uq" ON "object_blobs" USING btree ("storage_key");