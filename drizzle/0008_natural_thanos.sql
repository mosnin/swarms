CREATE TYPE "public"."review_status" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "review_status" "review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "reviewed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;