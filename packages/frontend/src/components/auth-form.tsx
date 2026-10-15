import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  authClient,
  signIn,
  signOut,
  signUp,
  useSession,
} from "@/lib/auth-client"

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

export function AuthForm() {
  const { data: session, isPending } = useSession()
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Loading session…</p>
  }

  if (session) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Signed in as{" "}
          <span className="font-medium">
            {session.user.name ?? session.user.email}
          </span>
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === "signUp") {
        const { error } = await signUp.email({ name, email, password })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await signIn.email({ email, password })
        if (error) throw new Error(error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    await authClient.signIn.social(
      { provider: "google", callbackURL: "/" },
      { onError: (ctx) => setError(ctx.error.message) }
    )
  }

  return (
    <div className="w-full max-w-sm rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="flex size-10 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            z
          </div>
          <h1 className="font-medium text-lg">Sign in to zConnect</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back — sign in to continue.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void handleGoogle()}
          >
            Continue with Google
          </Button>
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-muted-foreground text-xs">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode === "signIn" ? "default" : "outline"}
              onClick={() => setMode("signIn")}
            >
              Sign in
            </Button>
            <Button
              variant={mode === "signUp" ? "default" : "outline"}
              onClick={() => setMode("signUp")}
            >
              Sign up
            </Button>
          </div>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            {mode === "signUp" && (
              <input
                className={inputClass}
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              className={inputClass}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={inputClass}
              type="password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signUp"
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
