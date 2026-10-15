CREATE TABLE "status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_sequence" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "status" ADD CONSTRAINT "status_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sequence" ADD CONSTRAINT "project_sequence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_project_name_unique" ON "status" USING btree ("project_id","name");
