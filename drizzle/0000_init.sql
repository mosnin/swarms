CREATE TYPE "public"."budget_period" AS ENUM('once', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."connector_account_status" AS ENUM('active', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'archived', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'awaiting_payment', 'awaiting_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_kind" AS ENUM('charge', 'credit', 'refund', 'payment', 'adjustment', 'hold', 'release');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'settled', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('view', 'execute', 'manage');--> statement-breakpoint
CREATE TYPE "public"."policy_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."skill_version_status" AS ENUM('draft', 'published', 'deprecated', 'yanked');--> statement-breakpoint
CREATE TYPE "public"."skill_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"hashed_key" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"name" text NOT NULL,
	"external_account_id" text,
	"secret_ref" text,
	"encrypted_credentials" text,
	"encryption_key_id" text,
	"status" "connector_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"grantee_organization_id" text,
	"grantee_user_id" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"level" "permission_level" DEFAULT 'execute' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"provider" varchar(96) NOT NULL,
	"description" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"grantee_organization_id" text,
	"grantee_user_id" text,
	"level" "permission_level" DEFAULT 'execute' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"version" varchar(32) NOT NULL,
	"status" "skill_version_status" DEFAULT 'draft' NOT NULL,
	"manifest" jsonb NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"price_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "skill_visibility" DEFAULT 'private' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"worker_run_id" text,
	"level" varchar(16) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"api_key_id" text,
	"capability_kind" varchar(16) NOT NULL,
	"skill_version_id" text,
	"idempotency_key" varchar(255) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"cost_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"queued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"job_step_id" text,
	"worker_id" text NOT NULL,
	"sandbox_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"scope" jsonb,
	"limit_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"hard_stop" boolean DEFAULT true NOT NULL,
	"spent_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"wallet_id" text,
	"job_id" text,
	"direction" "ledger_direction" NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"description" text,
	"ref_type" varchar(64),
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x402_payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text,
	"idempotency_key" varchar(255) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"scheme" varchar(64) NOT NULL,
	"nonce" text NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"challenge" jsonb,
	"proof" jsonb,
	"provider_ref" text,
	"expires_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x402_payment_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text,
	"payment_attempt_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"tx_ref" text NOT NULL,
	"provider_ref" text,
	"breakdown" jsonb,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"actor_api_key_id" text,
	"action" varchar(128) NOT NULL,
	"resource_type" varchar(64) NOT NULL,
	"resource_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" varchar(64),
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"effect" "policy_effect" DEFAULT 'deny' NOT NULL,
	"action" varchar(128) NOT NULL,
	"resource_pattern" text DEFAULT '*' NOT NULL,
	"conditions" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarm_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"swarm_run_id" text NOT NULL,
	"role" varchar(64) NOT NULL,
	"skill_version_id" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"cost_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarm_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"swarm_template_id" text NOT NULL,
	"job_id" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"cost_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarm_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"topology" jsonb NOT NULL,
	"member_refs" jsonb NOT NULL,
	"visibility" "skill_visibility" DEFAULT 'private' NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"price_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_permissions" ADD CONSTRAINT "connector_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_permissions" ADD CONSTRAINT "connector_permissions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_permissions" ADD CONSTRAINT "connector_permissions_grantee_organization_id_organizations_id_fk" FOREIGN KEY ("grantee_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_permissions" ADD CONSTRAINT "connector_permissions_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_grantee_organization_id_organizations_id_fk" FOREIGN KEY ("grantee_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_worker_run_id_worker_runs_id_fk" FOREIGN KEY ("worker_run_id") REFERENCES "public"."worker_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD CONSTRAINT "worker_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD CONSTRAINT "worker_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_runs" ADD CONSTRAINT "worker_runs_job_step_id_job_steps_id_fk" FOREIGN KEY ("job_step_id") REFERENCES "public"."job_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_payment_attempts" ADD CONSTRAINT "x402_payment_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_payment_attempts" ADD CONSTRAINT "x402_payment_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_payment_receipts" ADD CONSTRAINT "x402_payment_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_payment_receipts" ADD CONSTRAINT "x402_payment_receipts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_payment_receipts" ADD CONSTRAINT "x402_payment_receipts_payment_attempt_id_x402_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."x402_payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_api_key_id_api_keys_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_swarm_run_id_swarm_runs_id_fk" FOREIGN KEY ("swarm_run_id") REFERENCES "public"."swarm_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_agents" ADD CONSTRAINT "swarm_agents_skill_version_id_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_runs" ADD CONSTRAINT "swarm_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_runs" ADD CONSTRAINT "swarm_runs_swarm_template_id_swarm_templates_id_fk" FOREIGN KEY ("swarm_template_id") REFERENCES "public"."swarm_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_runs" ADD CONSTRAINT "swarm_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swarm_templates" ADD CONSTRAINT "swarm_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hashed_key_uq" ON "api_keys" USING btree ("hashed_key");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_uq" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_org_currency_uq" ON "wallets" USING btree ("organization_id","currency");--> statement-breakpoint
CREATE INDEX "connector_accounts_connector_idx" ON "connector_accounts" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "connector_permissions_connector_idx" ON "connector_permissions" USING btree ("connector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_org_slug_uq" ON "connectors" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "skill_permissions_skill_idx" ON "skill_permissions" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_permissions_grantee_org_idx" ON "skill_permissions" USING btree ("grantee_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_skill_version_uq" ON "skill_versions" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_slug_uq" ON "skills" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "skills_visibility_idx" ON "skills" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "execution_logs_job_idx" ON "execution_logs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_steps_job_seq_uq" ON "job_steps" USING btree ("job_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_org_idempotency_uq" ON "jobs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_org_status_idx" ON "jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "worker_runs_job_idx" ON "worker_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "budgets_org_idx" ON "budgets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_org_idx" ON "usage_ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_job_idx" ON "usage_ledger_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ledger_wallet_idx" ON "usage_ledger_entries" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "x402_attempts_org_idem_uq" ON "x402_payment_attempts" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "x402_attempts_job_idx" ON "x402_payment_attempts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "x402_receipts_job_idx" ON "x402_payment_receipts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "x402_receipts_attempt_idx" ON "x402_payment_receipts" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "policy_rules_org_idx" ON "policy_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "swarm_agents_run_idx" ON "swarm_agents" USING btree ("swarm_run_id");--> statement-breakpoint
CREATE INDEX "swarm_runs_template_idx" ON "swarm_runs" USING btree ("swarm_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swarm_templates_org_slug_uq" ON "swarm_templates" USING btree ("organization_id","slug");