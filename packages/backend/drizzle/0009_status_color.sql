ALTER TABLE "status" ADD COLUMN "color" varchar(7) DEFAULT '#94a3b8' NOT NULL;--> statement-breakpoint
UPDATE "status" SET "color" = CASE "name"
  WHEN 'Backlog' THEN '#bec2c8'
  WHEN 'Todo' THEN '#e2e2e2'
  WHEN 'In Progress' THEN '#f2c94c'
  WHEN 'In Review' THEN '#0f783c'
  WHEN 'Done' THEN '#5e6ad2'
  WHEN 'Canceled' THEN '#95a2b3'
  WHEN 'Duplicate' THEN '#95a2b3'
  ELSE '#94a3b8'
END;