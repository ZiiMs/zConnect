import { defineConfig } from "@neon/config/v1"

export default defineConfig({
  // Neon Auth is provisioned but not used at runtime: the app keeps its
  // self-managed Better Auth on this branch's Postgres. Remove this line and
  // run `neon deploy` to disable the unused Auth service.
  auth: true,
  // Neon Realtime (beta): backend-sealed live SQL replaces the old
  // backend-mediated SSE transport. Child branches inherit it.
  // Run `neon deploy` after changing this.
  preview: { realtime: true },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {}
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" }
    }
    // Existing branch: no changes
    return {}
  },
})
