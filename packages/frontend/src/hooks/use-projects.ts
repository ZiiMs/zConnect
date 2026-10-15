import { useCallback, useEffect, useState } from "react"
import { api, type Project } from "@/lib/api"

/** Loads a workspace's projects and tracks the selected one. */
export function useProjects(workspaceId: string | null) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setProjects([])
      setSelectedId(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const loaded = await api.listProjects(workspaceId)
      setProjects(loaded)
      setSelectedId((current) =>
        current && loaded.some((p) => p.id === current)
          ? current
          : (loaded[0]?.id ?? null)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    setSelectedId(null)
    void refresh()
  }, [refresh])

  const selected = projects.find((p) => p.id === selectedId) ?? null

  function replace(updated: Project) {
    setProjects((current) =>
      current.map((p) => (p.id === updated.id ? updated : p))
    )
  }

  return {
    projects,
    selectedId,
    selected,
    select: setSelectedId,
    loading,
    error,
    refresh,
    replace,
  }
}
