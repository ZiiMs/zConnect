CREATE TABLE "github_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_user_id" text NOT NULL,
	"connector_account_id" text NOT NULL,
	"login" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_manual_refresh_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_connection_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "github_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" varchar(16) NOT NULL,
	"author_login" text NOT NULL,
	"author_avatar_url" text,
	"url" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"body_excerpt" text,
	"github_created_at" timestamp with time zone NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_pull_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" varchar(16) NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"author_login" text NOT NULL,
	"author_avatar_url" text,
	"url" text NOT NULL,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"checks_state" varchar(16),
	"review_decision" varchar(32),
	"comment_count" integer DEFAULT 0 NOT NULL,
	"body_excerpt" text,
	"github_created_at" timestamp with time zone NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repository" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"github_id" text NOT NULL,
	"full_name" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"issues_enabled" boolean DEFAULT true NOT NULL,
	"default_branch" text,
	"pushed_at" timestamp with time zone,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text
);
--> statement-breakpoint
CREATE TABLE "project_repository" (
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"linked_by" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_repository_project_id_repository_id_pk" PRIMARY KEY("project_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "github_connection" ADD CONSTRAINT "github_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issue" ADD CONSTRAINT "github_issue_repository_id_github_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_request" ADD CONSTRAINT "github_pull_request_repository_id_github_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository" ADD CONSTRAINT "github_repository_connection_id_github_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repository" ADD CONSTRAINT "project_repository_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repository" ADD CONSTRAINT "project_repository_repository_id_github_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_issue_repository_number_unique" ON "github_issue" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "github_issue_repository_state_updated_idx" ON "github_issue" USING btree ("repository_id","state","github_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_request_repository_number_unique" ON "github_pull_request" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "github_pull_request_repository_state_updated_idx" ON "github_pull_request" USING btree ("repository_id","state","github_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repository_connection_github_id_unique" ON "github_repository" USING btree ("connection_id","github_id");--> statement-breakpoint
CREATE INDEX "external_link_url_idx" ON "external_link" USING btree ("url");