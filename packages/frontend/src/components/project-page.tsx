import { ProjectIssues } from "@/components/project-issues"
import type { Project } from "@/lib/api"

/**
 * Project home: the Issue views with a screen-reader title. The visual
 * header is the compact breadcrumb row inside `ProjectIssues`
 * (`{Project} › Issues ☆` plus presets), so the dashboard costs two short
 * rows instead of a stacked title, breadcrumb, and toolbar. Workflow
 * management lives fully under Settings.
 */
export function ProjectPage({
  project,
  canManage,
  canWriteIssues,
  userId,
}: {
  project: Project
  canManage: boolean
  canWriteIssues: boolean
  userId: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <h2 className="sr-only">{project.name}</h2>
      <ProjectIssues
        project={project}
        userId={userId}
        canWrite={canWriteIssues}
        canAdmin={canManage}
      />
    </div>
  )
}
