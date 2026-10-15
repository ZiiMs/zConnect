import { describe, expect, test } from "vitest"
import { isTerminalCategory, type Status } from "@/lib/api"
import {
  activeStatusIds,
  backlogStatusIds,
  presetForStatusIds,
  presetStatusIds,
} from "./issue-filter-presets.js"

/** The ADR-0001 default roster, in position order. */
const statuses: Status[] = [
  {
    id: "st-backlog",
    projectId: "pr-1",
    name: "Backlog",
    category: "Backlog",
    position: 0,
  },
  {
    id: "st-todo",
    projectId: "pr-1",
    name: "Todo",
    category: "Unstarted",
    position: 1,
  },
  {
    id: "st-progress",
    projectId: "pr-1",
    name: "In Progress",
    category: "In Progress",
    position: 2,
  },
  {
    id: "st-review",
    projectId: "pr-1",
    name: "In Review",
    category: "In Progress",
    position: 3,
  },
  {
    id: "st-done",
    projectId: "pr-1",
    name: "Done",
    category: "Completed",
    position: 4,
  },
  {
    id: "st-canceled",
    projectId: "pr-1",
    name: "Canceled",
    category: "Canceled",
    position: 5,
  },
  {
    id: "st-duplicate",
    projectId: "pr-1",
    name: "Duplicate",
    category: "Duplicate",
    position: 6,
  },
]

describe("issue filter presets", () => {
  test("Active is the three open categories, in position order", () => {
    expect(activeStatusIds(statuses)).toEqual([
      "st-backlog",
      "st-todo",
      "st-progress",
      "st-review",
    ])
  })

  test("Backlog is the Backlog category only", () => {
    expect(backlogStatusIds(statuses)).toEqual(["st-backlog"])
  })

  test("All Issues filters nothing, so the query keeps its archived default", () => {
    expect(presetStatusIds("all", statuses)).toEqual([])
  })

  test("Active never names a terminal category", () => {
    const activeIds = new Set(activeStatusIds(statuses))
    const activeCategories = statuses
      .filter((status) => activeIds.has(status.id))
      .map((status) => status.category)

    expect(activeCategories).toEqual([
      "Backlog",
      "Unstarted",
      "In Progress",
      "In Progress",
    ])
    for (const category of activeCategories) {
      expect(isTerminalCategory(category)).toBe(false)
    }
  })

  test("presetForStatusIds reads the current selection", () => {
    expect(presetForStatusIds(activeStatusIds(statuses), statuses)).toBe(
      "active"
    )
    expect(
      presetForStatusIds(
        ["st-review", "st-backlog", "st-todo", "st-progress"],
        statuses
      )
    ).toBe("active")
    expect(presetForStatusIds(backlogStatusIds(statuses), statuses)).toBe(
      "backlog"
    )
    expect(presetForStatusIds([], statuses)).toBe("all")
  })

  test("a hand-narrowed selection belongs to no preset", () => {
    expect(presetForStatusIds(["st-done"], statuses)).toBeNull()
    expect(presetForStatusIds(["st-backlog", "st-todo"], statuses)).toBeNull()
  })

  test("a project with no statuses still resolves a preset", () => {
    expect(activeStatusIds([])).toEqual([])
    expect(backlogStatusIds([])).toEqual([])
    expect(presetForStatusIds([], [])).toBe("all")
  })
})
