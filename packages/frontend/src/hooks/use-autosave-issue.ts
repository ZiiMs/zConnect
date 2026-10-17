import { useCallback, useEffect, useRef, useState } from "react"
import type { Issue, UpdateIssueInput } from "@/lib/api"

export type BodySaveState = "saved" | "editing" | "saving" | "error"
export type TitleSaveState = "saved" | "editing" | "saving" | "error"

const BODY_DEBOUNCE_MS = 800
const BODY_STALENESS_MS = 5000
const RETRY_DELAYS = [1000, 2000, 4000]

/**
 * Autosave for one open Issue (§7): title commits on blur/Enter, body saves
 * on an 800ms trailing debounce with a 5s staleness ceiling. Serializes once
 * per fire, skips PATCH when unchanged, merges title+body when both dirty,
 * keeps max 1 in-flight (superseded payloads coalesce, never abort sent
 * PATCH). Failures keep the draft with 1s/2s/4s backoff, manual Retry after
 * 3; never reverts. Flush on blur/unmount/switch/close/tab-hide/unload.
 * Paused while a conflict banner is up (`paused`).
 */
export function useAutosaveIssue({
  issue,
  onSave,
  paused = false,
  onEditingChange,
  onSaved,
}: {
  issue: Issue
  onSave: (issue: Issue, input: UpdateIssueInput) => Promise<Issue>
  paused?: boolean
  onEditingChange?: (editing: boolean) => void
  onSaved?: (updated: Issue) => void
}) {
  const [titleDraft, setTitleDraftState] = useState(issue.title)
  const [titleState, setTitleState] = useState<TitleSaveState>("saved")
  const [titleError, setTitleError] = useState<string | null>(null)
  const [bodyDraft, setBodyDraftState] = useState(issue.description ?? "")
  const [bodyState, setBodyState] = useState<BodySaveState>("saved")
  const [bodyError, setBodyError] = useState<string | null>(null)

  const issueRef = useRef(issue)
  issueRef.current = issue
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const lastSavedBody = useRef(issue.description ?? "")
  const lastSavedTitle = useRef(issue.title)
  const draftRef = useRef(bodyDraft)
  draftRef.current = bodyDraft
  const titleDraftRef = useRef(titleDraft)
  titleDraftRef.current = titleDraft
  const titleDirtyRef = useRef(false)
  const bodyDirtyRef = useRef(false)
  const inFlightRef = useRef(false)
  const pendingRef = useRef<null | { title?: string; description?: string }>(
    null
  )
  const failuresRef = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stalenessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const isEditing =
    titleDirtyRef.current || bodyDirtyRef.current
      ? true
      : titleState === "editing" || bodyState === "editing"

  const editingRef = useRef(false)
  function emitEditing() {
    const editing =
      titleDirtyRef.current ||
      bodyDirtyRef.current ||
      titleState === "editing" ||
      bodyState === "editing" ||
      bodyState === "error" ||
      titleState === "error"
    if (editing !== editingRef.current) {
      editingRef.current = editing
      onEditingChange?.(editing)
    }
  }

  function clearTimers() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (stalenessTimer.current) clearTimeout(stalenessTimer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    debounceTimer.current = null
    stalenessTimer.current = null
    retryTimer.current = null
  }

  // Sync when the server row moves underneath a clean editor (remote
  // applied, issue switched, Load-latest). Never clobber a dirty draft.
  const issueIdRef = useRef(issue.id)
  useEffect(() => {
    if (issue.id !== issueIdRef.current) {
      issueIdRef.current = issue.id
      clearTimers()
      inFlightRef.current = false
      pendingRef.current = null
      failuresRef.current = 0
      titleDirtyRef.current = false
      bodyDirtyRef.current = false
      lastSavedTitle.current = issue.title
      lastSavedBody.current = issue.description ?? ""
      setTitleDraftState(issue.title)
      setBodyDraftState(issue.description ?? "")
      setTitleState("saved")
      setBodyState("saved")
      setTitleError(null)
      setBodyError(null)
      emitEditing()
      return
    }
    if (!titleDirtyRef.current && issue.title !== lastSavedTitle.current) {
      lastSavedTitle.current = issue.title
      setTitleDraftState(issue.title)
      setTitleState("saved")
      setTitleError(null)
    }
    if (
      !bodyDirtyRef.current &&
      (issue.description ?? "") !== lastSavedBody.current
    ) {
      lastSavedBody.current = issue.description ?? ""
      setBodyDraftState(issue.description ?? "")
      setBodyState("saved")
      setBodyError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id, issue.title, issue.description])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function runSave(payload: { title?: string; description?: string }) {
    if (inFlightRef.current) {
      // Coalesce: keep only the latest superseding payload.
      pendingRef.current = {
        ...(pendingRef.current ?? {}),
        ...payload,
      }
      return
    }
    inFlightRef.current = true
    const hadTitle = payload.title !== undefined
    const hadBody = payload.description !== undefined
    if (hadTitle) setTitleState("saving")
    if (hadBody) setBodyState("saving")
    try {
      const input: UpdateIssueInput = {}
      if (hadTitle) input.title = payload.title
      if (hadBody) input.description = payload.description
      const updated = await onSaveRef.current(issueRef.current, input)
      if (!mountedRef.current) return
      failuresRef.current = 0
      setBodyError(null)
      if (hadTitle) {
        lastSavedTitle.current = updated.title
        titleDirtyRef.current = false
        setTitleState("saved")
        setTitleError(null)
      }
      if (hadBody) {
        lastSavedBody.current = updated.description ?? ""
        // Only clear dirty when the draft still matches what we sent;
        // the user may have typed during the flight (coalesced below).
        if (draftRef.current === payload.description) {
          bodyDirtyRef.current = false
          setBodyState("saved")
        }
      }
      onSaved?.(updated)
      emitEditing()
    } catch (err) {
      if (!mountedRef.current) return
      failuresRef.current += 1
      const message = err instanceof Error ? err.message : "Save failed"
      if (hadTitle) {
        setTitleState("error")
        setTitleError(message)
      }
      if (hadBody) {
        setBodyState("error")
        setBodyError(message)
        const attempt = failuresRef.current
        if (attempt <= RETRY_DELAYS.length) {
          retryTimer.current = setTimeout(
            () => {
              void flush()
            },
            RETRY_DELAYS[attempt - 1]
          )
        }
      }
      emitEditing()
    } finally {
      inFlightRef.current = false
      const next = pendingRef.current
      pendingRef.current = null
      if (
        next &&
        (next.title !== undefined || next.description !== undefined)
      ) {
        void runSave(next)
      }
    }
  }

  const flush = useCallback(async () => {
    if (pausedRef.current) return
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (stalenessTimer.current) {
      clearTimeout(stalenessTimer.current)
      stalenessTimer.current = null
    }
    const payload: { title?: string; description?: string } = {}
    if (
      titleDirtyRef.current &&
      titleDraftRef.current.trim() !== "" &&
      titleDraftRef.current !== lastSavedTitle.current
    ) {
      payload.title = titleDraftRef.current.trim()
    }
    if (bodyDirtyRef.current && draftRef.current !== lastSavedBody.current) {
      payload.description = draftRef.current
    }
    if (payload.title === undefined && payload.description === undefined) {
      return
    }
    await runSave(payload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scheduleBody() {
    if (pausedRef.current) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      if (stalenessTimer.current) {
        clearTimeout(stalenessTimer.current)
        stalenessTimer.current = null
      }
      void flush()
    }, BODY_DEBOUNCE_MS)
    if (!stalenessTimer.current) {
      stalenessTimer.current = setTimeout(() => {
        stalenessTimer.current = null
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current)
          debounceTimer.current = null
        }
        void flush()
      }, BODY_STALENESS_MS)
    }
  }

  function setTitleDraft(next: string) {
    setTitleDraftState(next)
    titleDirtyRef.current = next !== lastSavedTitle.current
    setTitleState(titleDirtyRef.current ? "editing" : "saved")
    if (!titleDirtyRef.current) setTitleError(null)
    emitEditing()
  }

  async function commitTitle() {
    const trimmed = titleDraftRef.current.trim()
    if (trimmed === "") {
      setTitleError("Title is required")
      setTitleState("editing")
      emitEditing()
      return false
    }
    if (trimmed === lastSavedTitle.current) {
      titleDirtyRef.current = false
      setTitleState("saved")
      setTitleError(null)
      emitEditing()
      return true
    }
    titleDirtyRef.current = true
    await flush()
    return titleState !== "error"
  }

  function cancelTitle() {
    titleDirtyRef.current = false
    setTitleDraftState(lastSavedTitle.current)
    setTitleState("saved")
    setTitleError(null)
    emitEditing()
  }

  function setBodyDraft(next: string) {
    setBodyDraftState(next)
    const dirty = next !== lastSavedBody.current
    bodyDirtyRef.current = dirty
    if (!dirty) {
      setBodyState("saved")
      setBodyError(null)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = null
      emitEditing()
      return
    }
    setBodyState("editing")
    setBodyError(null)
    failuresRef.current = 0
    emitEditing()
    scheduleBody()
  }

  function retryBody() {
    failuresRef.current = 0
    setBodyError(null)
    if (bodyDirtyRef.current) setBodyState("editing")
    void flush()
  }

  /** Discard the local draft in favor of the latest server row. */
  function discardDraft() {
    clearTimers()
    titleDirtyRef.current = false
    bodyDirtyRef.current = false
    failuresRef.current = 0
    pendingRef.current = null
    lastSavedTitle.current = issueRef.current.title
    lastSavedBody.current = issueRef.current.description ?? ""
    setTitleDraftState(issueRef.current.title)
    setBodyDraftState(issueRef.current.description ?? "")
    setTitleState("saved")
    setBodyState("saved")
    setTitleError(null)
    setBodyError(null)
    emitEditing()
  }

  // Flush on unmount / tab-hide / unload (best-effort; never reverts).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") void flush()
    }
    function onPageHide() {
      void flush()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      void flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush])

  // Pause: stop timers while a conflict banner is up. On resume (Keep
  // editing), flush any dirty draft — timers were killed on pause, so
  // without this the draft would sit unsaved until the next keystroke.
  useEffect(() => {
    if (paused) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (stalenessTimer.current) clearTimeout(stalenessTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      debounceTimer.current = null
      stalenessTimer.current = null
      retryTimer.current = null
    } else if (titleDirtyRef.current || bodyDirtyRef.current) {
      void flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  return {
    titleDraft,
    setTitleDraft,
    titleState,
    titleError,
    commitTitle,
    cancelTitle,
    bodyDraft,
    setBodyDraft,
    bodyState,
    bodyError,
    retryBody,
    discardDraft,
    flush,
    isEditing,
  }
}
