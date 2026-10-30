// kilocode_change - new file
/**
 * history:// protocol handler - resolves command history entries.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class HistoryProtocolHandler implements ProtocolHandler {
  readonly scheme = "history"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "history", id: name }, null, 2),
      contentType: "application/json",
      notes: [`History: ${name}`],
    }
  }
}