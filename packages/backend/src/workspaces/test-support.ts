import type { WorkspaceStore } from "./store.js"

/**
 * T2 test support: `createProject` always seeds the default roster and the
 * six tutorial issues (ADR-0001). Feature tests that want an empty tracker
 * clear those rows first.
 *
 * Clearing does not rewind the project sequence: the seeded issues already
 * consumed `KEY-1`…`KEY-6`, so the first issue such a test creates is
 * `KEY-7` — the documented consequence of seeding.
 */
export async function clearSeededTracker(
  store: WorkspaceStore,
  projectId: string
): Promise<void> {
  for (const issue of await store.listIssues(projectId)) {
    await store.deleteIssue(issue.id)
  }
  for (const status of await store.listStatuses(projectId)) {
    await store.deleteStatus(status.id)
  }
}
