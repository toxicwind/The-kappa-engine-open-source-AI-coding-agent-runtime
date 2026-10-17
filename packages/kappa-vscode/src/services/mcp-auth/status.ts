import type { McpStatus } from "@kappacode/sdk/v2/client"

/** Names of servers reporting `needs_auth`, sorted. Classification belongs to the CLI. */
export function needsAuthNames(status: Record<string, McpStatus>): string[] {
  return Object.entries(status)
    .filter(([, entry]) => entry.status === "needs_auth")
    .map(([name]) => name)
    .sort()
}
