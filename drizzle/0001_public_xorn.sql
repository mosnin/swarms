CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."runner_type" AS ENUM('mock', 'http', 'local_worker');--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "runner_type" "runner_type" DEFAULT 'mock' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "runner_config" jsonb;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "checksum" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "risk_level" "risk_level" DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "required_permissions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "default_price_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "price_currency" varchar(3) DEFAULT 'USD' NOT NULL;