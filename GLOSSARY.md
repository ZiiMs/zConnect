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
A named step in a project's workflow (e.g. In Review), ordered for Kanban display, with a display color.
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

**Comment**:
A markdown message on an Issue, written by a Member, optionally one level of reply under
another Comment on the same Issue. Edits keep the row and set an edited marker; deletes
clear the body and leave a tombstone.
_Avoid_: Note, Message, Post

**Activity**:
The issue history feed: Activity Events and Comments merged chronologically into one
timeline.
_Avoid_: Audit log, Changelog

**Activity Event**:
One recorded Issue mutation (status, assignee, priority, due date, title, description,
labels, parent, project, archive) or external GitHub link event, with an actor and old/new
values. Comments are not Activity Events.
_Avoid_: Timeline event, Log entry

**Watcher**:
A Member subscribed to an Issue's notifications. Auto-watched on create, assignment,
comment, and mention; can be toggled manually.
_Avoid_: Follower, Subscriber

**Notification**:
An in-app row telling one Member that something happened on an Issue they are assigned
to, mentioned in, or watching. Owned by exactly one Member.
_Avoid_: Alert, Ping

**Inbox**:
The Member's list of Notifications, newest first, with All and Unread filters and an
unread count in the rail.
_Avoid_: Feed, Activity

**Mention**:
A link to a Member inside a Comment body, written as `[@Display Name](mention:<userId>)`
by autocomplete. Only workspace Members eligible to read the Issue can be mentioned.
_Avoid_: Tag, At-mention

**Saved Filter**:
A named, reusable Issue query. Deferred to R3.
_Avoid_: Preset, View

## Deferred

**Epic, Sprint, Milestone, Automation, Report**:
Explicitly out of MVP. Do not use for MVP scope.
_Avoid_: V1 scope creep
