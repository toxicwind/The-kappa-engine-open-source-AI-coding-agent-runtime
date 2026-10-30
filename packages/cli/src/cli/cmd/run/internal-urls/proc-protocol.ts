// kilocode_change - new file
/**
 * proc:// protocol handler - resolves process resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class ProcProtocolHandler implements ProtocolHandler {
  readonly scheme = "proc"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "proc", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Proc: ${name}`],
    }
  }
}