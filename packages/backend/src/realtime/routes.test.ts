import { beforeEach, describe, expect, test } from "bun:test"
import type { RawSqlQuery, SealedLiveQuery } from "@neon/realtime/server"
import type { Session } from "../workspaces/session.js"
import { createMemoryWorkspaceStore } from "../workspaces/store.js"
import { clearSeededTracker } from "../workspaces/test-support.js"
import { createRealtimeApp } from "./routes.js"
import type { RealtimeSealer } from "./service.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const viewer = { id: "user-viewer", email: "viewer@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const sessions: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [viewer.id]: viewer,
  [outsider.id]: outsider,
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

function fakeSealer(captured: RawSqlQuery<unknown>[]): RealtimeSealer {
  return {
    async seal<Row>(query: RawSqlQuery<Row>): Promise<SealedLiveQuery<Row>> {
      captured.push(query as RawSqlQuery<unknown>)
      return {
        capability: "test-capability",
        expiresAt: Date.now() + 60_000,
        queryFingerprint: "test-fingerprint",
      }
    },
  }
}

async function setup() {
  const store = createMemoryWorkspaceStore()
  const captured: RawSqlQuery<unknown>[] = []
  const app = createRealtimeApp({
    store,
    getSession: async (req) => {
      const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
      const user = match ? sessions[match[1]] : undefined
      return user ? { user } : null
    },
    sealer: fakeSealer(captured),
  })
  const workspace = await store.createWorkspace(owner.id, "Acme")
  const project = await store.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  await clearSeededTracker(store, project.id)
  const status = await store.createStatus(project.id, {
    name: "Todo",
    category: "Unstarted",
  })
  const issue = await store.createIssue(project.id, {
    title: "Live issue",
    statusId: status.id,
  })
  await store.addProjectViewer(project.id, viewer.id)

  const other = await store.createProject(workspace.id, {
    name: "Other",
    key: "OTH",
  })
  const [otherStatus] = await store.listStatuses(other.id)
  const otherIssue = await store.createIssue(other.id, {
    title: "Hidden",
    statusId: otherStatus!.id,
  })

  return {
    app,
    captured,
    store,
    workspace,
    project,
    status,
    issue,
    other,
    otherIssue,
    sealer: fakeSealer(captured),
  }
}

function body(value: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  }
}

function post(
  app: Awaited<ReturnType<typeof setup>>["app"],
  path: string,
  userId: string | undefined,
  value: unknown
) {
  return app.request(path, {
    ...body(value),
    headers: { ...body(value).headers, ...auth(userId) },
  })
}

describe("sealed live query routes", () => {
  let fixture: Awaited<ReturnType<typeof setup>>

  beforeEach(async () => {
    fixture = await setup()
  })

  test("requires a session on every route", async () => {
    const paths: [string, unknown][] = [
      ["/api/realtime/queries/project-issues", { projectId: fixture.project.id }],
      ["/api/realtime/queries/issue", { ref: fixture.issue.identifier }],
      ["/api/realtime/queries/timeline", { ref: fixture.issue.identifier }],
      ["/api/realtime/queries/notifications", {}],
      ["/api/realtime/queries/unread-count", {}],
    ]
    for (const [path, value] of paths) {
      const res = await post(fixture.app, path, undefined, value)
      expect(res.status).toBe(401)
    }
  })

  test("returns 503 when Realtime has no secret", async () => {
    const app = createRealtimeApp({
      store: fixture.store,
      getSession: async () => ({ user: owner }),
      sealer: null,
    })
    const res = await post(
      app,
      "/api/realtime/queries/project-issues",
      owner.id,
      { projectId: fixture.project.id }
    )
    expect(res.status).toBe(503)
  })

  test("seals a project issue query with the user and filter params", async () => {
    const res = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      owner.id,
      {
        projectId: fixture.project.id,
        filters: {
          statusIds: [fixture.status.id],
          priorities: ["High", "Bogus"],
          assigneeId: null,
          labels: ["bug"],
          text: "live",
        },
      }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      capability: "test-capability",
      expiresAt: expect.any(Number),
      queryFingerprint: "test-fingerprint",
    })

    const query = fixture.captured[0]
    expect(query?.sql).toContain("workspace_member")
    expect(query?.sql).toContain("project_viewer")
    expect(query?.sql).toContain("i.project_id = $2")
    expect(query?.parameters[0]).toEqual({ typeOid: 0, value: owner.id })
    expect(query?.parameters[1]).toEqual({
      typeOid: 0,
      value: fixture.project.id,
    })
    // Priority input is filtered to the domain's five values. pgParam encodes
    // text arrays in Postgres text format (quoted elements).
    expect(query?.parameters[3]?.value).toBe('{"High"}')
  })

  test("an outsider cannot seal a project query", async () => {
    const res = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      outsider.id,
      { projectId: fixture.project.id }
    )
    expect(res.status).toBe(403)
  })

  test("a granted Viewer can seal a project query", async () => {
    const res = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      viewer.id,
      { projectId: fixture.project.id }
    )
    expect(res.status).toBe(200)
  })

  test("a Viewer cannot seal a project outside their grant", async () => {
    const res = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      viewer.id,
      { projectId: fixture.other.id }
    )
    expect(res.status).toBe(403)
  })

  test("unknown projects are 404 and invalid bodies are 400", async () => {
    const missing = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      owner.id,
      { projectId: "00000000-0000-0000-0000-000000000000" }
    )
    expect(missing.status).toBe(404)

    const invalid = await post(
      fixture.app,
      "/api/realtime/queries/project-issues",
      owner.id,
      { projectId: fixture.project.id, filters: { statusIds: "nope" } }
    )
    expect(invalid.status).toBe(400)
  })

  test("seals one issue by its resolved database id", async () => {
    const res = await post(fixture.app, "/api/realtime/queries/issue", owner.id, {
      ref: fixture.issue.identifier,
    })
    expect(res.status).toBe(200)
    expect(fixture.captured[0]?.sql).toContain("i.id = $2")
    expect(fixture.captured[0]?.parameters[1]).toEqual({
      typeOid: 0,
      value: fixture.issue.id,
    })
  })

  test("issue and timeline access follows the project read gate", async () => {
    for (const path of [
      "/api/realtime/queries/issue",
      "/api/realtime/queries/timeline",
    ]) {
      const forbidden = await post(fixture.app, path, outsider.id, {
        ref: fixture.otherIssue.identifier,
      })
      expect(forbidden.status).toBe(403)

      const missing = await post(fixture.app, path, owner.id, {
        ref: "NOPE-999",
      })
      expect(missing.status).toBe(404)
    }
  })

  test("seals the timeline with the requested limit", async () => {
    const res = await post(
      fixture.app,
      "/api/realtime/queries/timeline",
      viewer.id,
      { ref: fixture.issue.identifier, limit: 25 }
    )
    expect(res.status).toBe(200)
    expect(fixture.captured[0]?.sql).toContain("activity_event")
    expect(fixture.captured[0]?.parameters[2]).toEqual({
      typeOid: 0,
      // rawSql encodes bare values in Postgres text format.
      value: "25",
    })
  })

  test("seals notifications and the unread count for the session user", async () => {
    const list = await post(
      fixture.app,
      "/api/realtime/queries/notifications",
      owner.id,
      { limit: 30 }
    )
    expect(list.status).toBe(200)
    expect(fixture.captured[0]?.parameters[0]).toEqual({
      typeOid: 0,
      value: owner.id,
    })
    // rawSql encodes bare values in Postgres text format.
    expect(fixture.captured[0]?.parameters[1]?.value).toBe("30")

    const count = await post(
      fixture.app,
      "/api/realtime/queries/unread-count",
      owner.id,
      {}
    )
    expect(count.status).toBe(200)
    expect(fixture.captured[1]?.sql).toContain("read_at IS NULL")
    expect(fixture.captured[1]?.parameters[0]).toEqual({
      typeOid: 0,
      value: owner.id,
    })
  })
})
