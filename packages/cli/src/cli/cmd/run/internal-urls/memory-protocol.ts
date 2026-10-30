// kilocode_change - new file
/**
 * memory:// protocol handler - resolves session-memory resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class MemoryProtocolHandler implements ProtocolHandler {
  readonly scheme = "memory"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "memory", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Memory: ${name}`],
    }
  }
}