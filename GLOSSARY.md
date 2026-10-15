# zConnect

Task management for software teams: workspaces own projects, projects own issues, issues render in list, table, and kanban views.

## Language

**Workspace**:
A team boundary owning members, projects, and issues.
_Avoid_: Organization, Team, Account

**Project**:
A container for issues inside a workspace, with its own key prefix and workflow statuses.
_Avoid_: Board, Repo

**Issue**:
The core unit of work, with a human identifier like WEB-123, title, status, priority, assignee, and labels.
_Avoid_: Task, Ticket, Work item, Story

**Subtask**:
An issue linked to a parent issue via parent_id, for one level of breakdown.
_Avoid_: Child task, Nested task

**View**:
A presentation of the same issue query as a List, Table, or Kanban board.
_Avoid_: Page, Layout

**External Link**:
An issue reference to a GitHub PR, branch, or commit, created manually or auto-created from webhooks.
_Avoid_: Integration, Sync

**Status**:
A named step in a project's workflow (e.g. In Review), ordered for Kanban display.
_Avoid_: State, Column

**Status Category**:
The fixed bucket a status rolls up to: Backlog, Unstarted, In Progress, Completed, Canceled, or Duplicate. Completed, Canceled, and Duplicate are terminal: they count as done everywhere (grouping, progress, guardrails).
_Avoid_: Group, Phase

**Project Key**:
A short uppercase prefix (e.g. WEB) used to form human issue identifiers like WEB-123.
_Avoid_: Prefix, Code

**Label**:
A free-form tag for grouping and filtering issues.
_Avoid_: Tag

**Priority**:
Urgency of an issue: Urgent, High, Medium, Low, or None.
_Avoid_: Severity, Importance

**Member**:
A user belonging to a workspace with a role Owner, Admin, or Member.
_Avoid_: Teammate, Collaborator

## Deferred

**Epic, Sprint, Milestone, Automation, Report**:
Explicitly out of MVP. Do not use for MVP scope.
_Avoid_: V1 scope creep
