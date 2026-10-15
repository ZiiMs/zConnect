import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth.js"

const app = new Hono()

app.use(
  "/api/auth/*",
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  })
)

app.all("/api/auth/*", (c) => auth.handler(c.req.raw))

app.get("/", (c) => {
  return c.text("Hello Hono!")
})

export default app
