CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"parent_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_watcher" (
	"issue_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_mode" varchar(16) DEFAULT 'digest' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watcher" ADD CONSTRAINT "issue_watcher_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_watcher_issue_user_unique" ON "issue_watcher" USING btree ("issue_id","user_id");--> statement-breakpoint

-- Data migration: old GitHub timeline rows become namespaced Activity Events.
-- Old kind text carries over as both `github.<kind>` and the event summary.
INSERT INTO activity_event (id, issue_id, actor_type, actor_id, type, summary, payload, created_at) SELECT id, issue_id, 'github', NULL, 'github.' || kind, body, '{}'::jsonb, created_at FROM timeline_event;--> statement-breakpoint
DROP TABLE "timeline_event";--> statement-breakpoint

-- RLS deny-all: no policies by design. The backend connects as the table
-- owner or a BYPASSRLS role, so these tables stay inaccessible to anon and
-- authenticated PostgREST clients while the API keeps working.
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_install" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issue_label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issue_watcher" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_sequence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_viewer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_token" ENABLE ROW LEVEL SECURITY;