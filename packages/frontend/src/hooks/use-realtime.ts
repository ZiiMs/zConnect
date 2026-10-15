import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useEffect } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Subscribes to all changes (INSERT/UPDATE/DELETE) on a `public` table.
 * Table must be in the `supabase_realtime` publication.
 */
export function useRealtime<T extends Record<string, unknown>>(
  table: string,
  onEvent: (payload: RealtimePostgresChangesPayload<T>) => void
) {
  useEffect(() => {
    const channel = supabase
      .channel(`public:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, onEvent)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, onEvent])
}
