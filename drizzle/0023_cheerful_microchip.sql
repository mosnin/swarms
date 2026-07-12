CREATE TABLE "auto_reload_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"threshold_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"min_interval_seconds" integer DEFAULT 3600 NOT NULL,
	"last_reload_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_reload_configs" ADD CONSTRAINT "auto_reload_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_reload_org_uq" ON "auto_reload_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "auto_reload_enabled_idx" ON "auto_reload_configs" USING btree ("enabled");