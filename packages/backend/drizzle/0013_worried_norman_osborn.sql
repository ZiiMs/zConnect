ALTER TABLE "issue_label" ADD COLUMN "applied_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "status" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "status" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_parent_id_label_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."label"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Seed the Workflow copy for existing default statuses (new Projects get it
-- from DEFAULT_STATUS_ROSTER).
UPDATE "status" SET "description" = CASE "name"
  WHEN 'Backlog' THEN 'Ideas and work that is not scheduled yet.'
  WHEN 'Todo' THEN 'Ready to be picked up.'
  WHEN 'In Progress' THEN 'Actively being worked on.'
  WHEN 'In Review' THEN 'Pull request is being reviewed.'
  WHEN 'Done' THEN 'Work is complete.'
  WHEN 'Canceled' THEN 'Won''t be done.'
  WHEN 'Duplicate' THEN 'Already tracked elsewhere.'
END
WHERE "description" IS NULL AND "name" IN ('Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled', 'Duplicate');--> statement-breakpoint

-- Pick Todo as the default where it exists, then the first status (by
-- position) for any Project that still has none.
UPDATE "status" SET "is_default" = true WHERE "name" = 'Todo';--> statement-breakpoint
UPDATE "status" s SET "is_default" = true
WHERE s."id" IN (
  SELECT DISTINCT ON ("project_id") "id"
  FROM "status" AS inner_status
  WHERE NOT EXISTS (
    SELECT 1 FROM "status" AS chosen
    WHERE chosen."project_id" = inner_status."project_id" AND chosen."is_default"
  )
  ORDER BY "project_id", "position"
);--> statement-breakpoint

CREATE UNIQUE INDEX "status_project_default_unique" ON "status" USING btree ("project_id") WHERE "status"."is_default";
