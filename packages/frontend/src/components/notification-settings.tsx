import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { api, type EmailMode } from "@/lib/api"

const MODES: {
  value: EmailMode
  label: string
  description: string
}[] = [
  {
    value: "immediate",
    label: "Immediate",
    description: "Email me as soon as something happens in my Inbox.",
  },
  {
    value: "digest",
    label: "Digest",
    description:
      "Batch updates into a periodic digest instead of an email per event. (default)",
  },
  {
    value: "off",
    label: "Off",
    description: "Keep notifications in the app and never send email.",
  },
]

/**
 * Per-user email notification preference. Available to every workspace role,
 * Viewers included, so it lives in Settings but is never permission-gated.
 */
export function NotificationSettings() {
  const [mode, setMode] = useState<EmailMode>("digest")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    kind: "saved" | "error"
    text: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getNotificationSettings()
      .then((settings) => {
        if (!cancelled) setMode(settings.emailMode)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setMessage({
            kind: "error",
            text:
              err instanceof Error
                ? err.message
                : "Failed to load notification settings",
          })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await api.updateNotificationSettings(mode)
      setMode(saved.emailMode)
      setMessage({ kind: "saved", text: "Saved" })
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to save settings",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label="Notification settings"
      className="flex max-w-xl flex-col gap-4"
    >
      <div>
        <h3 className="font-medium text-sm">Email notifications</h3>
        <p className="text-muted-foreground text-sm">
          Choose when zConnect emails you about your Inbox.
        </p>
      </div>

      <fieldset
        disabled={loading || saving}
        aria-label="Email notification mode"
        className="flex flex-col gap-2"
      >
        {MODES.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
              mode === option.value ? "bg-accent" : ""
            }`}
          >
            <input
              type="radio"
              name="email-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => {
                setMode(option.value)
                setMessage(null)
              }}
              className="mt-0.5 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button disabled={loading || saving} onClick={() => void save()}>
          Save settings
        </Button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={
              message.kind === "error"
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
