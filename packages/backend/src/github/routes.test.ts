import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { createWorkspacesApp } from "../workspaces/routes.js"
import type { Session } from "../workspaces/session.js"
import {
  createMemoryWorkspaceStore,
  type WorkspaceStore,
} from "../workspaces/store.js"
import { handlePullRequestEvent } from "./handler.js"
import type { GitHubWebhookPayload } from "./job.js"
import { createGitHubApp } from "./routes.js"
import { createMemoryGitHubStore } from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }

const users: Record<string, Session["user"]> = {
  [owner.id]: owner,
  [member.id]: member,
  [outsider.id]: outsider,
}

function auth(userId?: string): Record<string, string> {
  return userId ? { authorization: `Bearer ${userId}` } : {}
}

function setup(webhookSecret?: string) {
  const workspaces = createMemoryWorkspaceStore()
  const github = createMemoryGitHubStore()
  const enqueued: GitHubWebhookPayload[] = []
  const app = new Hono()
  const getSession = async (req: Request) => {
    const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")
    const user = match ? users[match[1]] : undefined
    return user ? { user } : null
  }
  app.route("/", createWorkspacesApp({ store: workspaces, getSession }))
  app.route(
    "/",
    createGitHubApp({
      workspaces,
      github,
      getSession,
      webhookSecret,
      enqueue: async (job) => {
        enqueued.push(job)
      },
    })
  )
  return { app, workspaces, github, enqueued }
}

async function seed(app: Hono, workspaces: WorkspaceStore) {
  const workspace = await workspaces.createWorkspace(owner.id, "Acme")
  const project = await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  const status = await workspaces.createStatus(project.id, {
    name: "Backlog",
    category: "Unstarted",
  })
  const issue = await workspaces.createIssue(project.id, {
    title: "Fix login",
    statusId: status.id,
  })
  // Member joins through the invite flow so membership is realistic.
  await app.request(`/api/workspaces/${workspace.id}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth(owner.id) },
    body: JSON.stringify({ email: member.email, role: "Member" }),
  })
  const mine = await app.request("/api/invitations", {
    headers: auth(member.id),
  })
  const [{ id }] = (await mine.json()) as { id: string }[]
  await app.request(`/api/invitations/${id}/accept`, {
    method: "POST",
    headers: auth(member.id),
  })
  return { workspaceId: workspace.id, issue }
}

function pullRequestPayload() {
  return {
    action: "opened",
    number: 7,
    pull_request: {
      number: 7,
      title: "Fix login",
      body: "Fixes WEB-1",
      html_url: "https://github.com/acme/web/pull/7",
      head: { ref: "WEB-1-fix-login" },
      merged: false,
    },
    repository: { full_name: "acme/web" },
  }
}

function webhookHeaders(extra?: Record<string, string>) {
  return {
    "content-type": "application/json",
    "x-github-event": "pull_request",
    "x-github-delivery": "delivery-1",
    ...extra,
  }
}

describe("github installs", () => {
  test("owner installs on selected repos; member is forbidden", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    const created = await app.request(
      `/api/workspaces/${workspaceId}/github-installs`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ repos: ["acme/web"] }),
      }
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      workspaceId,
      repos: ["acme/web"],
    })

    const listed = await app.request(
      `/api/workspaces/${workspaceId}/github-installs`,
      { headers: auth(member.id) }
    )
    expect(listed.status).toBe(200)
    expect(await listed.json()).toHaveLength(1)

    const denied = await app.request(
      `/api/workspaces/${workspaceId}/github-installs`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ repos: ["acme/other"] }),
      }
    )
    expect(denied.status).toBe(403)
    expect(
      (await app.request(`/api/workspaces/${workspaceId}/github-installs`))
        .status
    ).toBe(401)
  })

  test("empty or malformed repos return 400", async () => {
    const { app, workspaces } = setup()
    const { workspaceId } = await seed(app, workspaces)
    const res = await app.request(
      `/api/workspaces/${workspaceId}/github-installs`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(owner.id) },
        body: JSON.stringify({ repos: [] }),
      }
    )
    expect(res.status).toBe(400)
  })
})

describe("manual external links", () => {
  test("pasting a PR URL creates a link plus a timeline event", async () => {
    const { app, workspaces, github } = setup()
    const { issue } = await seed(app, workspaces)
    const created = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ url: "https://github.com/acme/web/pull/7" }),
      }
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      provider: "github",
      kind: "pr",
    })
    expect(await github.listExternalLinks(issue.id)).toHaveLength(1)
    expect(
      (await github.listTimelineEvents(issue.id)).map((e) => e.kind)
    ).toEqual(["link.manual"])
  })

  test("non-GitHub URLs are rejected; outsiders are forbidden", async () => {
    const { app, workspaces } = setup()
    const { issue } = await seed(app, workspaces)
    const bad = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(member.id) },
        body: JSON.stringify({ url: "https://example.com/x" }),
      }
    )
    expect(bad.status).toBe(400)
    const denied = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth(outsider.id) },
        body: JSON.stringify({ url: "https://github.com/acme/web/pull/7" }),
      }
    )
    expect(denied.status).toBe(403)
  })
})

describe("webhook intake", () => {
  test("PR opened enqueues a typed job and returns 202", async () => {
    const { app, workspaces, enqueued } = setup()
    await seed(app, workspaces)
    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders(),
      body: JSON.stringify(pullRequestPayload()),
    })
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      deliveryId: "delivery-1",
      action: "opened",
      repoFullName: "acme/web",
      url: "https://github.com/acme/web/pull/7",
    })
  })

  test("unsupported events are acknowledged without enqueueing", async () => {
    const { app, workspaces, enqueued } = setup()
    await seed(app, workspaces)
    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders({ "x-github-event": "push" }),
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(0)
  })

  test("push deliveries with KEY-N commits enqueue a push job", async () => {
    const { app, workspaces, enqueued } = setup()
    await seed(app, workspaces)
    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders({
        "x-github-event": "push",
        "x-github-delivery": "push-1",
      }),
      body: JSON.stringify({
        repository: { full_name: "acme/web" },
        commits: [
          {
            id: "abc123def456",
            message: "Fix WEB-1 login redirect",
            url: "https://github.com/acme/web/commit/abc123def456",
          },
        ],
      }),
    })
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      kind: "push",
      deliveryId: "push-1",
      repoFullName: "acme/web",
      commits: [
        {
          sha: "abc123def456",
          message: "Fix WEB-1 login redirect",
          url: "https://github.com/acme/web/commit/abc123def456",
        },
      ],
    })
  })

  test("push deliveries without usable commits are ignored", async () => {
    const { app, workspaces, enqueued } = setup()
    await seed(app, workspaces)
    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders({
        "x-github-event": "push",
        "x-github-delivery": "push-2",
      }),
      body: JSON.stringify({
        repository: { full_name: "acme/web" },
        commits: [{ id: "abc123", message: "", url: "https://x" }],
      }),
    })
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(0)
  })

  test("a configured secret rejects unsigned deliveries", async () => {
    const { app, workspaces } = setup("test-secret")
    await seed(app, workspaces)
    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders(),
      body: JSON.stringify(pullRequestPayload()),
    })
    expect(res.status).toBe(401)
  })
})

describe("link and timeline reads", () => {
  test("issue shows the merged badge plus timeline after the job runs", async () => {
    const { app, workspaces, github } = setup()
    const { workspaceId, issue } = await seed(app, workspaces)
    await github.createInstall(workspaceId, ["acme/web"])
    await handlePullRequestEvent(
      { workspaces, github },
      {
        deliveryId: "delivery-1",
        action: "opened",
        repoFullName: "acme/web",
        branch: "WEB-1-fix-login",
        body: "Fixes WEB-1",
        url: "https://github.com/acme/web/pull/7",
        title: "Fix login",
        number: 7,
        merged: false,
      }
    )
    await handlePullRequestEvent(
      { workspaces, github },
      {
        deliveryId: "delivery-2",
        action: "closed",
        repoFullName: "acme/web",
        branch: "WEB-1-fix-login",
        body: "Fixes WEB-1",
        url: "https://github.com/acme/web/pull/7",
        title: "Fix login",
        number: 7,
        merged: true,
      }
    )
    const links = await app.request(
      `/api/issues/${issue.identifier}/external-links`,
      { headers: auth(member.id) }
    )
    expect(links.status).toBe(200)
    expect(await links.json()).toMatchObject([{ state: "merged" }])
    const timeline = await app.request(
      `/api/issues/${issue.identifier}/timeline`,
      { headers: auth(member.id) }
    )
    expect(timeline.status).toBe(200)
    expect(
      ((await timeline.json()) as { kind: string }[]).map((e) => e.kind)
    ).toEqual(["link.opened", "link.merged"])
  })
})
