-- Neon Realtime has no RLS support yet. Live queries run inside the Realtime
-- query engine, outside the backend's BYPASSRLS connection, so deny-all RLS
-- made every live read fail with `upstream_rejected`.
--
-- The browser still has no database credential. Authorization is the sealed
-- query's membership / Viewer predicates, which the API builds only after
-- checking the session (see packages/backend/src/realtime/queries.ts).
-- Auth and workspace-token tables remain deny-all: Realtime never reads them.
ALTER TABLE "issue" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_viewer" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_event" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" DISABLE ROW LEVEL SECURITY;
