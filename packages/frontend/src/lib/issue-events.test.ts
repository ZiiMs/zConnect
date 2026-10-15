import { describe, expect, test } from "vitest"
import {
  applyRemoteIssue,
  type Issue,
  matchesIssueFilters,
  type Priority,
} from "./api.js"

const base: Issue = {
  id: "is-1",
  projectId: "pr-1",
  number: 1,
  keyPrefix: "WEB",
  identifier: "WEB-1",
  title: "Fix login",
  description: null,
  statusId: "st-1",
  priority: "High",
  assigneeId: null,
  dueDate: null,
  archived: false,
  labels: [],
}

describe("matchesIssueFilters", () => {
  test("an empty filter matches everything", () => {
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: [],
        assigneeId: undefined,
        text: "",
      })
    ).toBe(true)
  })

  test("status filter narrows to the selected statuses", () => {
    expect(
      matchesIssueFilters(base, {
        statusIds: ["st-2"],
        priorities: [],
        assigneeId: undefined,
        text: "",
      })
    ).toBe(false)
    expect(
      matchesIssueFilters(base, {
        statusIds: ["st-1"],
        priorities: [],
        assigneeId: undefined,
        text: "",
      })
    ).toBe(true)
  })

  test("priority filter narrows to the selected priorities", () => {
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: ["Low"],
        assigneeId: undefined,
        text: "",
      })
    ).toBe(false)
  })

  test("assignee filter distinguishes unassigned from members", () => {
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: [],
        assigneeId: "user-x",
        text: "",
      })
    ).toBe(false)
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: [],
        assigneeId: null,
        text: "",
      })
    ).toBe(true)
  })

  test("text matches identifier or title case-insensitively", () => {
    const byTitle: {
      statusIds: string[]
      priorities: Priority[]
      assigneeId: undefined
      text: string
    } = {
      statusIds: [],
      priorities: [],
      assigneeId: undefined,
      text: "login",
    }
    expect(matchesIssueFilters(base, { ...byTitle })).toBe(true)
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: [],
        assigneeId: undefined,
        text: "web-1",
      })
    ).toBe(true)
    expect(
      matchesIssueFilters(base, {
        statusIds: [],
        priorities: [],
        assigneeId: undefined,
        text: "checkout",
      })
    ).toBe(false)
  })
})

describe("applyRemoteIssue", () => {
  test("an insert appends in issue-number order", () => {
    const incoming: Issue = {
      ...base,
      id: "is-0",
      number: 0,
      identifier: "WEB-0",
    }
    const { issues, applied } = applyRemoteIssue([base], incoming)
    expect(applied).toBe(true)
    expect(issues.map((i) => i.identifier)).toEqual(["WEB-0", "WEB-1"])
  })

  test("an update replaces the matching issue", () => {
    const incoming: Issue = { ...base, title: "Fix login faster" }
    const { issues, applied } = applyRemoteIssue([base], incoming)
    expect(applied).toBe(true)
    expect(issues[0]?.title).toBe("Fix login faster")
  })

  test("last-write-wins: an older incoming update is ignored", () => {
    const current: Issue = {
      ...base,
      title: "Newer",
      updatedAt: "2026-10-15T12:00:00.000Z",
    }
    const incoming: Issue = {
      ...base,
      title: "Older",
      updatedAt: "2026-10-15T11:00:00.000Z",
    }
    const { issues, applied } = applyRemoteIssue([current], incoming)
    expect(applied).toBe(false)
    expect(issues[0]?.title).toBe("Newer")
  })

  test("without timestamps the incoming update wins", () => {
    const { issues, applied } = applyRemoteIssue([base], {
      ...base,
      title: "Remote",
    })
    expect(applied).toBe(true)
    expect(issues[0]?.title).toBe("Remote")
  })
})
