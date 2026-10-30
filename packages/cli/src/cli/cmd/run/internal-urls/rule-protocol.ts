// kilocode_change - new file
/**
 * rule:// protocol handler - resolves agent rule resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class RuleProtocolHandler implements ProtocolHandler {
  readonly scheme = "rule"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "rule", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Rule: ${name}`],
    }
  }
}