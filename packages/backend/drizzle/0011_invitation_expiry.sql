ALTER TABLE "invitation" ADD COLUMN "expires_at" timestamp with time zone DEFAULT (now() + interval '7 days') NOT NULL;
