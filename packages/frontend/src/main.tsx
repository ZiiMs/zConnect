import { RealtimeProvider } from "@neon/realtime-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { realtimeClient } from "@/lib/realtime"
import App from "./App.tsx"

const app = (
  <ThemeProvider>
    <App />
  </ThemeProvider>
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {realtimeClient ? (
      <RealtimeProvider client={realtimeClient}>{app}</RealtimeProvider>
    ) : (
      app
    )}
  </StrictMode>
)
