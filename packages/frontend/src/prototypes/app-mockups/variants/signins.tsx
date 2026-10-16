/**
 * PROTOTYPE (throwaway) — sign-in variants Signin1–Signin8.
 * Same task in the same order; only structure and voice change.
 */

import { cn } from "cn"
import { useState } from "react"
import { Glyph } from "../atoms"

function Signin1Split() {
  return (
    <div className="proto-shell grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between gap-12 bg-primary p-10 text-primary-foreground lg:flex">
        <p className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
          <Glyph className="size-4" name="users" />
          Northwind Labs
        </p>
        <div>
          <h1 className="proto-heading max-w-md font-semibold text-4xl">
            Every issue, one board, no ceremony.
          </h1>
          <p className="mt-3 max-w-sm text-sm opacity-80">
            Sign in to pick up where Ada left off — triage, boards, and releases
            in one place.
          </p>
        </div>
        <figure className="max-w-sm border-current/20 border-t pt-4 text-sm">
          <blockquote className="opacity-90">
            “Friday triage went from an hour to ten minutes.”
          </blockquote>
          <figcaption className="mt-1 text-xs opacity-70">
            Priya Nair · Eng lead, Northwind Labs
          </figcaption>
        </figure>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Northwind Labs · Ada&apos;s workspace
          </p>
          <h2 className="proto-heading font-semibold text-2xl">Sign in</h2>
          <div className="flex gap-2">
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
          <label className="mt-1 text-xs">
            <span className="text-muted-foreground">Email</span>
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue="ada@northwind.dev"
              type="email"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Password</span>
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue="correct-horse-battery"
              type="password"
            />
          </label>
          <button
            className="mt-1 rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
            type="button"
          >
            Sign in
          </button>
          <p className="text-muted-foreground text-xs">
            <button className="underline" type="button">
              Create an account
            </button>
            <span> · </span>
            <button className="underline" type="button">
              Forgot password?
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function Signin2Card() {
  return (
    <div className="proto-shell proto-grid-bg flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-card p-6 shadow-lg">
        <p className="mx-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
          <Glyph className="size-3" name="users" />
          Northwind Labs
        </p>
        <h1 className="proto-heading text-center font-semibold text-lg">
          Sign in to zConnect
        </h1>
        <div className="flex gap-2">
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
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or with email
          <span className="h-px flex-1 bg-border" />
        </div>
        <label className="text-xs">
          <span className="text-muted-foreground">Email</span>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="ada@northwind.dev"
            type="email"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Password</span>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="correct-horse-battery"
            type="password"
          />
        </label>
        <label className="flex items-center gap-2 text-muted-foreground text-xs">
          <input className="size-3.5" defaultChecked type="checkbox" />
          Remember me on this device
        </label>
        <button
          className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
          type="button"
        >
          Sign in
        </button>
        <p className="text-center text-muted-foreground text-xs">
          New here?{" "}
          <button className="underline" type="button">
            Create an account
          </button>{" "}
          ·{" "}
          <button className="underline" type="button">
            Forgot password?
          </button>
        </p>
      </div>
    </div>
  )
}

function Signin3Preview() {
  return (
    <div className="proto-shell relative min-h-svh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 blur-[1px]"
      >
        <div className="flex h-full gap-3 p-6">
          {[0, 1, 2, 3].map((column) => (
            <div
              className="flex flex-1 flex-col gap-2 rounded-lg border bg-card p-2"
              key={column}
            >
              <span className="h-4 w-16 rounded bg-muted" />
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
      <div className="relative flex min-h-svh items-end justify-center bg-background/60 p-4 sm:p-8">
        <div className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border bg-card p-6 shadow-2xl">
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Glyph className="size-3.5" name="users" />
            Northwind Labs · back to the board
          </p>
          <h1 className="proto-heading font-semibold text-xl">Welcome back</h1>
          <div className="flex gap-2">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-muted-foreground">Email</span>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue="ada@northwind.dev"
                type="email"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Password</span>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue="correct-horse-battery"
                type="password"
              />
            </label>
          </div>
          <button
            className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
            type="button"
          >
            Sign in
          </button>
          <p className="flex justify-between text-muted-foreground text-xs">
            <button className="underline" type="button">
              Create an account
            </button>
            <button className="underline" type="button">
              Forgot password?
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function Signin4Minimal() {
  return (
    <div className="proto-shell flex min-h-svh flex-col px-6 py-8 sm:px-12">
      <header className="flex items-center justify-between">
        <span className="font-semibold text-sm">zConnect</span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Glyph className="size-3.5" name="users" />
          Northwind Labs
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <p className="text-muted-foreground text-xs uppercase tracking-widest">
          Northwind Labs — sign in
        </p>
        <h1 className="proto-heading mt-2 font-semibold text-3xl">
          Pick up where you left off.
        </h1>
        <div className="mt-4 flex gap-4 text-sm">
          <button
            className="inline-flex items-center gap-1.5 underline underline-offset-4"
            type="button"
          >
            <Glyph className="size-3.5" name="branch" />
            GitHub
          </button>
          <button
            className="inline-flex items-center gap-1.5 underline underline-offset-4"
            type="button"
          >
            <Glyph className="size-3.5" name="mail" />
            Google
          </button>
        </div>
        <label className="mt-4 flex items-baseline gap-4 border-b py-3">
          <span className="w-20 shrink-0 text-muted-foreground text-xs">
            Email
          </span>
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            defaultValue="ada@northwind.dev"
            type="email"
          />
        </label>
        <label className="flex items-baseline gap-4 border-b py-3">
          <span className="w-20 shrink-0 text-muted-foreground text-xs">
            Password
          </span>
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            defaultValue="correct-horse-battery"
            type="password"
          />
        </label>
        <button
          className="mt-4 text-left font-medium text-sm underline underline-offset-4"
          type="button"
        >
          Sign in →
        </button>
        <p className="mt-6 flex gap-4 text-muted-foreground text-xs">
          <button className="underline" type="button">
            Create an account
          </button>
          <button className="underline" type="button">
            Forgot password?
          </button>
        </p>
      </div>
    </div>
  )
}

function Signin5Prompt() {
  return (
    <div className="proto-shell proto-grid-bg flex min-h-svh items-center justify-center p-6">
      <div className="proto-mono w-full max-w-xl rounded border bg-card p-6 text-[13px] leading-relaxed">
        <p className="text-muted-foreground"># northwind labs · secure shell</p>
        <p className="mt-1">$ zconnect login --workspace northwind-labs</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded border border-dashed px-2 py-1 hover:bg-accent"
            type="button"
          >
            [ github ]
          </button>
          <button
            className="rounded border border-dashed px-2 py-1 hover:bg-accent"
            type="button"
          >
            [ google ]
          </button>
        </div>
        <label className="mt-4 block">
          <span className="text-muted-foreground">email&gt; </span>
          <input
            className="w-full border-b border-dashed bg-transparent outline-none sm:w-auto sm:min-w-64"
            defaultValue="ada@northwind.dev"
            type="email"
          />
        </label>
        <label className="mt-2 block">
          <span className="text-muted-foreground">pass&gt; </span>
          <input
            className="w-full border-b border-dashed bg-transparent outline-none sm:w-auto sm:min-w-64"
            defaultValue="correct-horse-battery"
            type="password"
          />
        </label>
        <div className="mt-4">
          <button
            className="rounded bg-primary px-3 py-1.5 text-primary-foreground"
            type="button"
          >
            [ sign in ]
          </button>
        </div>
        <p className="mt-4 flex flex-wrap gap-4 text-muted-foreground">
          <button className="underline" type="button">
            $ create-account
          </button>
          <button className="underline" type="button">
            $ forgot-password
          </button>
        </p>
        <p className="mt-2 text-muted-foreground text-xs">
          hint: press ^c to reset · sso ready
        </p>
      </div>
    </div>
  )
}

function Signin6Sheet() {
  return (
    <div className="proto-shell proto-grid-bg flex min-h-svh justify-end p-3">
      <div className="hidden max-w-md flex-1 items-center p-10 lg:flex">
        <h1 className="proto-heading font-semibold text-3xl">
          The board is already warm.
        </h1>
      </div>
      <div className="flex min-h-[calc(100svh-1.5rem)] w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-6 shadow-xl">
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Glyph className="size-3.5" name="users" />
          Northwind Labs
        </p>
        <h1 className="proto-heading font-semibold text-2xl">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to rejoin Ada&apos;s triage session.
        </p>
        <div className="mt-1 flex flex-col gap-2">
          <button
            className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm hover:bg-accent"
            type="button"
          >
            <Glyph className="size-4" name="branch" />
            Continue with GitHub
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm hover:bg-accent"
            type="button"
          >
            <Glyph className="size-4" name="mail" />
            Continue with Google
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or with email
          <span className="h-px flex-1 bg-border" />
        </div>
        <label className="text-xs">
          <span className="text-muted-foreground">Email</span>
          <input
            className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
            defaultValue="ada@northwind.dev"
            type="email"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Password</span>
          <input
            className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-sm"
            defaultValue="correct-horse-battery"
            type="password"
          />
        </label>
        <button
          className="mt-1 rounded-xl bg-primary px-3 py-3 text-primary-foreground text-sm"
          type="button"
        >
          Sign in →
        </button>
        <p className="mt-auto pt-4 text-muted-foreground text-xs">
          <button className="underline" type="button">
            Create an account
          </button>
          <span> · </span>
          <button className="underline" type="button">
            Forgot password?
          </button>
        </p>
      </div>
    </div>
  )
}

function Signin7Steps() {
  const [step, setStep] = useState(0)
  return (
    <div className="proto-shell flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-card p-6 shadow-lg">
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Glyph className="size-3.5" name="users" />
          Northwind Labs
        </p>
        <h1 className="proto-heading font-semibold text-xl">Sign in</h1>
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            Step {step + 1} of 2 · {step === 0 ? "email" : "password"}
          </span>
          <span className="flex gap-2">
            <button
              onClick={() => setStep(0)}
              type="button"
              className="underline"
            >
              Back
            </button>
            <button
              onClick={() => setStep((value) => (value + 1) % 2)}
              type="button"
              className="underline"
            >
              Continue
            </button>
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: step === 0 ? "50%" : "100%" }}
          />
        </div>
        <div className="flex gap-2">
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
        <label className={cn("text-xs", step !== 0 && "opacity-60")}>
          <span className="text-muted-foreground">
            {step === 0 ? "① Email" : "Email"}
          </span>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="ada@northwind.dev"
            type="email"
          />
        </label>
        <label className={cn("text-xs", step !== 1 && "opacity-60")}>
          <span className="text-muted-foreground">
            {step === 1 ? "② Password" : "Password"}
          </span>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue="correct-horse-battery"
            type="password"
          />
        </label>
        <button
          className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
          type="button"
        >
          Sign in
        </button>
        <p className="text-muted-foreground text-xs">
          <button className="underline" type="button">
            Create an account
          </button>
          <span> · </span>
          <button className="underline" type="button">
            Forgot password?
          </button>
        </p>
      </div>
    </div>
  )
}

function Signin8Gradient() {
  return (
    <div
      className="proto-shell flex min-h-svh items-center justify-center p-6"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--primary) 22%, transparent), transparent 60%), var(--background)",
      }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card/90 p-8 text-center shadow-2xl backdrop-blur">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Glyph className="size-5" name="sparkle" />
        </span>
        <p className="mx-auto mt-4 flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
          <Glyph className="size-3" name="users" />
          Northwind Labs
        </p>
        <h1 className="proto-heading mt-2 font-semibold text-2xl">
          Where teams ship together
        </h1>
        <div className="mt-4 flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-accent"
            type="button"
          >
            <Glyph className="size-3.5" name="branch" />
            GitHub
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs hover:bg-accent"
            type="button"
          >
            <Glyph className="size-3.5" name="mail" />
            Google
          </button>
        </div>
        <div className="mt-3 text-left">
          <label className="text-xs">
            <span className="text-muted-foreground">Email</span>
            <input
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              defaultValue="ada@northwind.dev"
              type="email"
            />
          </label>
          <label className="mt-2 block text-xs">
            <span className="text-muted-foreground">Password</span>
            <input
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm"
              defaultValue="correct-horse-battery"
              type="password"
            />
          </label>
        </div>
        <button
          className="mt-3 w-full rounded-xl bg-primary px-3 py-2.5 text-primary-foreground text-sm"
          type="button"
        >
          Sign in with email
        </button>
        <p className="mt-3 text-muted-foreground text-xs">
          <button className="underline" type="button">
            Create an account
          </button>
          <span> · </span>
          <button className="underline" type="button">
            Forgot password?
          </button>
        </p>
      </div>
    </div>
  )
}

export const SIGNINS: Record<string, () => React.ReactNode> = {
  "1": Signin1Split,
  "2": Signin2Card,
  "3": Signin3Preview,
  "4": Signin4Minimal,
  "5": Signin5Prompt,
  "6": Signin6Sheet,
  "7": Signin7Steps,
  "8": Signin8Gradient,
}
