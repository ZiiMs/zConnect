import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)

// PROTOTYPE (throwaway) — dev-only theme overlay for the real app. The `DEV`
// guard plus the dynamic import keep the module, its CSS and its font out of
// the production build. See src/prototypes/app-mockups/real-theme.tsx.
if (import.meta.env.DEV) {
  void import("./prototypes/app-mockups/real-theme")
}
