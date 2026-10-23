/**
 * One list pipeline for a GitHub View tab (#49/#50): fetch, paginate, and
 * reload state shared by the Pull Requests and GitHub Issues tabs. The
 * component supplies only the fetch function and the filter set, so a tab
 * never grows a second copy of the load/append/error wiring.
 */
import { type Dispatch, type SetStateAction, useEffect, useState } from "react"
import type { PullRequestListResponse } from "@/lib/api"

/** Filters both GitHub View list endpoints accept. */
export interface GitHubListFilters {
  state: string
  author: string
  label: string
  q: string
  cursor?: string
}

/** Both list envelopes share every field except the item type. */
export type GitHubListData<T> = Omit<PullRequestListResponse, "items"> & {
  items: T[]
}

type FetchPage<T> = (
  projectId: string,
  filters: GitHubListFilters
) => Promise<GitHubListData<T>>

export interface GitHubList<T> {
  data: GitHubListData<T> | null
  items: T[]
  cursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  /** Appends the next page for the current filters. */
  loadMore: () => Promise<void>
  /** Local row patch after linking, so the table does not refetch. */
  setItems: Dispatch<SetStateAction<T[]>>
}

export function useGitHubList<T>({
  active,
  projectId,
  filters,
  reloadKey,
  fetchPage,
}: {
  /** False for the tab that is not on screen; it neither loads nor pages. */
  active: boolean
  projectId: string
  filters: GitHubListFilters
  /** Bumped by a manual refresh or a create dialog to refetch page one. */
  reloadKey: number
  fetchPage: FetchPage<T>
}): GitHubList<T> {
  const [data, setData] = useState<GitHubListData<T> | null>(null)
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Destructured so the effect reacts to value changes, not object identity.
  const { state, author, label, q } = filters

  useEffect(() => {
    if (!active) return
    // A manual refresh bumps reloadKey; the value itself is not read.
    void reloadKey
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchPage(projectId, { state, author, label, q })
      .then((response) => {
        if (cancelled) return
        setData(response)
        setItems(response.items)
        setCursor(response.nextCursor)
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, projectId, state, author, label, q, reloadKey, fetchPage])

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const response = await fetchPage(projectId, {
        state,
        author,
        label,
        q,
        cursor,
      })
      setData(response)
      setItems((current) => [...current, ...response.items])
      setCursor(response.nextCursor)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    data,
    items,
    cursor,
    loading,
    loadingMore,
    error,
    loadMore,
    setItems,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load"
}
