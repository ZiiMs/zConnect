import { AuthForm } from "@/components/auth-form"

export function App() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div>
          <h1 className="font-medium">zConnect</h1>
          <p className="text-muted-foreground text-sm">
            Sign in or create an account to continue.
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  )
}

export default App
