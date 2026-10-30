// kilocode_change - new file
/**
 * tau:// protocol handler - resolves tau core resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class TauProtocolHandler implements ProtocolHandler {
  readonly scheme = "tau"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "tau", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Tau: ${name}`],
    }
  }
}