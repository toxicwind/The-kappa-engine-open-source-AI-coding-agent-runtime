import type { KappaConnectionService } from "../cli-backend/connection-service"
import { McpAuthService, type McpAuthOpts, type McpAuthResult, type McpAuthStatus } from "./service"

export { McpAuthService, type McpAuthOpts, type McpAuthResult, type McpAuthStatus }
export { needsAuthNames } from "./status"

const instances = new WeakMap<KappaConnectionService, McpAuthService>()

/** One `McpAuthService` per connection, shared by the sidebar, Kappa tabs, Settings panel, and the Marketplace panel. */
export function mcpAuth(connection: KappaConnectionService, opts?: McpAuthOpts): McpAuthService {
  const existing = instances.get(connection)
  if (existing) return existing
  const service = new McpAuthService(connection, opts)
  instances.set(connection, service)
  return service
}
