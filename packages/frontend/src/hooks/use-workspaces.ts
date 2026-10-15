import { useCallback, useEffect, useState } from "react"
import { api, type Workspace } from "@/lib/api"

/** Loads the signed-in user's workspaces and tracks the selected one. */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loaded = await api.listWorkspaces()
      setWorkspaces(loaded)
      setSelectedId((current) =>
        current && loaded.some((w) => w.id === current)
          ? current
          : (loaded[0]?.id ?? null)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = workspaces.find((w) => w.id === selectedId) ?? null

  return {
    workspaces,
    selectedId,
    selected,
    select: setSelectedId,
    loading,
    error,
    refresh,
  }
}
