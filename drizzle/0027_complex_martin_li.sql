CREATE TYPE "public"."agent_instance_status" AS ENUM('active', 'paused', 'suspended', 'terminated');--> statement-breakpoint
CREATE TABLE "agent_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"api_key_id" text,
	"name" text NOT NULL,
	"template" varchar(64) DEFAULT 'hermes' NOT NULL,
	"instructions" text NOT NULL,
	"model" varchar(96) NOT NULL,
	"status" "agent_instance_status" DEFAULT 'active' NOT NULL,
	"wake_interval_minutes" integer,
	"next_wake_at" timestamp with time zone,
	"last_wake_at" timestamp with time zone,
	"last_job_id" text,
	"budget_minor_per_wake" bigint DEFAULT 100 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resource_bundle_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_instance_id" text NOT NULL,
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"content" text NOT NULL,
	"job_id" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_last_job_id_jobs_id_fk" FOREIGN KEY ("last_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_agent_instance_id_agent_instances_id_fk" FOREIGN KEY ("agent_instance_id") REFERENCES "public"."agent_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_instances_org_idx" ON "agent_instances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_instances_wake_idx" ON "agent_instances" USING btree ("status","next_wake_at");--> statement-breakpoint
CREATE INDEX "agent_messages_instance_idx" ON "agent_messages" USING btree ("agent_instance_id","processed_at");--> statement-breakpoint
CREATE INDEX "agent_messages_org_idx" ON "agent_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_messages_job_idx" ON "agent_messages" USING btree ("job_id");