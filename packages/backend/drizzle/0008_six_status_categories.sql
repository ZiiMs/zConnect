-- ADR-0001 dev reset: Status Category moves from three buckets
-- (Todo / In Progress / Done) to six (Backlog / Unstarted / In Progress /
-- Completed / Canceled / Duplicate). Existing status rows carry retired
-- category values, so the table is dropped and recreated rather than altered.
--
-- DEV ONLY — this is destructive and must never run against real data.
-- `issue.status_id` is NOT NULL with ON DELETE restrict, so the dependent
-- Issue rows go with the statuses instead of dangling (their External Links,
-- Timeline Events and Label links cascade off the Issue row).
ALTER TABLE "issue" DROP CONSTRAINT IF EXISTS "issue_status_id_status_id_fk";--> statement-breakpoint
DELETE FROM "issue";--> statement-breakpoint
DROP TABLE "status";--> statement-breakpoint
CREATE TABLE "status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "status" ADD CONSTRAINT "status_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_project_name_unique" ON "status" USING btree ("project_id","name");
