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
import {
  createMemoryGitHubStore,
  type GitHubStore,
  type RemoteRepository,
} from "./store.js"

const owner = { id: "user-owner", email: "owner@example.com" }
const member = { id: "user-member", email: "member@example.com" }
const outsider = { id: "user-outsider", email: "outsider@example.com" }
const connectedAt = "2026-10-01T10:00:00.000Z"

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
  await workspaces.createProject(workspace.id, {
    name: "Web",
    key: "WEB",
  })
  // T2: every new project arrives with the seeded roster and six tutorial
  // issues, so this fixture links against the seeded first issue (WEB-1).
  const issue = await workspaces.getIssue("WEB-1")
  if (!issue) throw new Error("seeded WEB-1 issue missing")
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

function pullRequestPayload(repo = "acme/web") {
  return {
    action: "opened",
    number: 7,
    pull_request: {
      number: 7,
      title: "Fix login",
      body: "Fixes WEB-1",
      html_url: `https://github.com/${repo}/pull/7`,
      head: { ref: "WEB-1-fix-login" },
      merged: false,
    },
    repository: { full_name: repo },
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

function remoteRepository(
  fullName: string,
  githubId = "101"
): RemoteRepository {
  const [repoOwner = "", name = ""] = fullName.split("/")
  return {
    githubId,
    fullName,
    owner: repoOwner,
    name,
    private: false,
    archived: false,
    issuesEnabled: true,
    defaultBranch: "main",
    pushedAt: null,
  }
}

/** The Connection allowlist is the webhook's only repository allowlist. */
async function selectRepository(
  github: GitHubStore,
  workspaceId: string,
  fullName = "acme/web"
) {
  const connection = await github.upsertConnection({
    workspaceId,
    connectorUserId: owner.id,
    connectorAccountId: "ba-account-1",
    login: "octocat",
    scopes: ["repo"],
    encryptedAccessToken: "v1.test",
    at: connectedAt,
  })
  await github.replaceAllowlist(
    connection.id,
    [remoteRepository(fullName)],
    connectedAt
  )
  return connection
}

async function drainEnqueued(
  workspaces: WorkspaceStore,
  github: GitHubStore,
  enqueued: GitHubWebhookPayload[]
) {
  const [job] = enqueued
  if (job?.kind !== "pull_request")
    throw new Error("expected a pull request job")
  return handlePullRequestEvent({ workspaces, github }, job)
}

describe("manual external links", () => {
  test("pasting a PR URL creates a link plus an Activity Event", async () => {
    const { app, workspaces } = setup()
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
    const events = await workspaces.listActivity(issue.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorType: "github",
      actorId: null,
      type: "github.link.manual",
      summary: "External Link added (pr acme/web)",
      payload: { kind: "link.manual" },
    })
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

  test("a selected repository's delivery enqueues and links the PR", async () => {
    const { app, workspaces, github, enqueued } = setup()
    const { workspaceId, issue } = await seed(app, workspaces)
    await selectRepository(github, workspaceId)

    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders(),
      body: JSON.stringify(pullRequestPayload()),
    })
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(1)

    const result = await drainEnqueued(workspaces, github, enqueued)
    expect(result).toEqual({ skipped: false, linked: ["WEB-1"] })
    expect(await github.listExternalLinks(issue.id)).toMatchObject([
      { kind: "pr", state: "open" },
    ])
  })

  test("an unselected repository's delivery is ignored by the handler", async () => {
    const { app, workspaces, github, enqueued } = setup()
    const { workspaceId, issue } = await seed(app, workspaces)
    await selectRepository(github, workspaceId)

    const res = await app.request("/api/webhooks/github", {
      method: "POST",
      headers: webhookHeaders({ "x-github-delivery": "delivery-unselected" }),
      body: JSON.stringify(pullRequestPayload("acme/other")),
    })
    // Intake stays repository-agnostic; the handler owns allowlist resolution.
    expect(res.status).toBe(202)
    expect(enqueued).toHaveLength(1)

    const result = await drainEnqueued(workspaces, github, enqueued)
    expect(result).toEqual({ skipped: false, linked: [] })
    expect(await github.listExternalLinks(issue.id)).toHaveLength(0)
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

describe("link reads", () => {
  test("issue shows the merged badge after the job runs", async () => {
    const { app, workspaces, github } = setup()
    const { workspaceId, issue } = await seed(app, workspaces)
    await selectRepository(github, workspaceId)
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
    const activity = await workspaces.listActivity(issue.id)
    expect(activity.map((event) => event.type).sort()).toEqual([
      "github.link.merged",
      "github.link.opened",
    ])
  })
})
