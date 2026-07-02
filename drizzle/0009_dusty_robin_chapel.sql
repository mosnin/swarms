CREATE TABLE "resource_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"encrypted" text NOT NULL,
	"encryption_key_id" varchar(64) NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "task" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "resource_bundle_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "model" varchar(96);--> statement-breakpoint
ALTER TABLE "resource_bundles" ADD CONSTRAINT "resource_bundles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_bundles" ADD CONSTRAINT "resource_bundles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_bundles_org_idx" ON "resource_bundles" USING btree ("organization_id");