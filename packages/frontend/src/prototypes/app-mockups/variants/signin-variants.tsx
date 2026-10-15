/**
 * PROTOTYPE sign-in variants S1–S5.
 *
 * The signed-out screen has no rail, board or detail pane for a layout to
 * own, so it carries five variants of its own. All five are the same task in
 * the same order (email, password, sign in, providers, create account) — only
 * structure and voice change, which is exactly what makes them worth
 * comparing.
 */
import { cn } from "cn"
import { useState } from "react"
import { Glyph } from "../atoms"
import type { SigninKey } from "../prototype-config"

export function SignIn({ variant }: { variant: SigninKey }) {
  if (variant === "S1") return <SignInSplit />
  if (variant === "S2") return <SignInCard />
  if (variant === "S3") return <SignInOverPreview />
  if (variant === "S4") return <SignInMinimal />
  return <SignInPrompt />
}

function Providers({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      <button
        className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent"
        type="button"
      >
        <Glyph className="size-3.5" name="branch" />
        GitHub
      </button>
      <button
        className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent"
        type="button"
      >
        <Glyph className="size-3.5" name="mail" />
        Google
      </button>
    </div>
  )
}

function EmailField({ label = "Email" }: { label?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        className="rounded-md border bg-background px-3 py-2 text-sm"
        defaultValue="ada@northwind.dev"
        type="email"
      />
    </label>
  )
}

function PasswordField() {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-muted-foreground text-xs">
        Password
        <span className="text-[11px] hover:text-foreground">Forgot?</span>
      </span>
      <input
        className="rounded-md border bg-background px-3 py-2 text-sm"
        defaultValue="correct-horse"
        type="password"
      />
    </label>
  )
}

function SignInSplit() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  return (
    <div className="proto-shell grid min-h-svh grid-cols-2">
      <div className="relative flex flex-col justify-between bg-primary p-10 text-primary-foreground">
        <span className="flex items-center gap-2 font-semibold text-sm">
          <span className="grid size-7 place-items-center rounded-md bg-primary-foreground/15 text-[11px]">
            NL
          </span>
          zConnect
        </span>
        <div className="flex flex-col gap-4">
          <h1 className="proto-heading max-w-sm font-semibold text-3xl leading-tight">
            Every issue, one board, no ceremony.
          </h1>
          <p className="max-w-sm text-sm opacity-80">
            Sort, drag and close issues with your team. Teammates see your
            changes the moment you make them.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-xs opacity-80">
          <p>“We replaced three tools with this. Nobody asked to go back.”</p>
          <p className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-primary-foreground/15">
              BV
            </span>
            Bruno Vega · Admin, Northwind Labs
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-10">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="proto-heading font-semibold text-xl">
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {mode === "signin"
                ? "Welcome back to Northwind Labs."
                : "One workspace, zero setup."}
            </p>
          </div>
          <Providers />
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-3">
            <EmailField />
            <PasswordField />
          </div>
          <button
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
            type="button"
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button
            className="text-muted-foreground text-xs hover:text-foreground"
            onClick={() =>
              setMode((current) => (current === "signin" ? "signup" : "signin"))
            }
            type="button"
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  )
}

function SignInCard() {
  return (
    <div className="proto-shell proto-grid-bg flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-9 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground text-xs">
            NL
          </span>
          <h1 className="proto-heading font-semibold text-lg">
            Sign in to zConnect
          </h1>
          <p className="text-muted-foreground text-xs">
            Continue with a provider, or use your email.
          </p>
        </div>
        <Providers />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-col gap-3">
          <EmailField />
          <PasswordField />
        </div>
        <label className="flex items-center gap-2 text-muted-foreground text-xs">
          <input type="checkbox" />
          Keep me signed in for 30 days
        </label>
        <button
          className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
          type="button"
        >
          Sign in
        </button>
        <p className="border-t pt-4 text-center text-muted-foreground text-xs">
          New here? <span className="text-foreground">Create an account</span>
        </p>
      </div>
    </div>
  )
}

function SignInOverPreview() {
  return (
    <div className="proto-shell relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40 blur-[1px]">
        <div className="flex h-full">
          <div className="flex w-56 flex-col gap-2 border-r bg-sidebar p-3">
            <span className="h-6 w-28 rounded bg-muted" />
            <span className="mt-3 h-4 w-20 rounded bg-muted" />
            <span className="h-5 w-32 rounded bg-muted" />
            <span className="h-5 w-24 rounded bg-muted" />
            <span className="h-5 w-28 rounded bg-muted" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-6">
            <span className="h-6 w-40 rounded bg-muted" />
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((column) => (
                <div
                  className="flex flex-1 flex-col gap-2 rounded-lg border p-2"
                  key={column}
                >
                  {[0, 1, 2].map((card) => (
                    <span
                      className="h-14 rounded bg-muted"
                      key={`${column}-${card}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex min-h-svh items-end justify-center bg-background/60 p-8 backdrop-blur-sm">
        <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground text-xs">
              NL
            </span>
            <div>
              <h1 className="proto-heading font-semibold text-lg">
                Welcome back
              </h1>
              <p className="text-muted-foreground text-xs">
                Sign in to Northwind Labs
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EmailField />
            <PasswordField />
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex-1 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
              type="button"
            >
              Sign in
            </button>
            <Providers className="flex-1" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            By signing in you agree to the terms of service and the privacy
            policy.
          </p>
        </div>
      </div>
    </div>
  )
}

function SignInMinimal() {
  return (
    <div className="proto-shell flex min-h-svh flex-col p-10">
      <span className="text-muted-foreground text-xs">
        zConnect · Northwind Labs
      </span>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7">
        <h1 className="proto-heading font-semibold text-3xl leading-tight">
          Sign in to your workspace.
        </h1>
        <div className="flex flex-col">
          <label className="flex items-center gap-4 border-b py-3">
            <span className="w-20 text-muted-foreground text-xs">Email</span>
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              defaultValue="ada@northwind.dev"
            />
          </label>
          <label className="flex items-center gap-4 border-b py-3">
            <span className="w-20 text-muted-foreground text-xs">Password</span>
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              defaultValue="correct-horse"
              type="password"
            />
          </label>
        </div>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 text-sm" type="button">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Glyph className="size-4" name="chevronRight" />
            </span>
            Continue with email
          </button>
          <span className="text-muted-foreground text-xs">or</span>
          <button
            className="text-sm underline underline-offset-4"
            type="button"
          >
            single sign-on
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          Trouble signing in? Ask an admin to re-invite{" "}
          <span className="text-foreground">ada@northwind.dev</span>.
        </p>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>Privacy</span>
        <span>Terms</span>
        <span>Status</span>
        <span className="ml-auto">v0.4.1</span>
      </div>
    </div>
  )
}

function SignInPrompt() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  return (
    <div className="proto-shell proto-grid-bg flex min-h-svh items-center justify-center p-6">
      <div className="proto-mono flex w-full max-w-xl flex-col gap-4 rounded border bg-card p-6 text-xs shadow-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: "var(--proto-ok)" }}
          />
          northwind:~$ zconnect {mode === "signin" ? "login" : "signup"}
        </div>
        <p className="text-muted-foreground">
          {mode === "signin"
            ? "// authenticate to continue"
            : "// create a workspace account"}
        </p>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">email:</span>
          <input
            className="flex-1 border-b border-dashed bg-transparent outline-none"
            defaultValue="ada@northwind.dev"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">password:</span>
          <input
            className="flex-1 border-b border-dashed bg-transparent outline-none"
            defaultValue="correct-horse"
            type="password"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            className="rounded bg-primary px-3 py-1.5 text-primary-foreground"
            type="button"
          >
            [ {mode === "signin" ? "sign in" : "create account"} ]
          </button>
          <span className="text-muted-foreground">or continue with</span>
          <button
            className="rounded border px-2 py-1 hover:bg-accent"
            type="button"
          >
            [ github ]
          </button>
          <button
            className="rounded border px-2 py-1 hover:bg-accent"
            type="button"
          >
            [ google ]
          </button>
        </div>
        <div className="flex flex-col gap-1 border-t pt-3 text-muted-foreground">
          <span>
            → no account?{" "}
            <button
              className="underline underline-offset-4"
              onClick={() =>
                setMode((current) =>
                  current === "signin" ? "signup" : "signin"
                )
              }
              type="button"
            >
              {mode === "signin" ? "sign up" : "sign in"}
            </button>
          </span>
          <span>→ forgot password? run `zconnect reset`</span>
          <span className="mt-1 flex items-center gap-2">
            <Glyph className="size-3" name="lock" />
            session expires in 30d · server ok · v0.4.1
          </span>
        </div>
      </div>
    </div>
  )
}
