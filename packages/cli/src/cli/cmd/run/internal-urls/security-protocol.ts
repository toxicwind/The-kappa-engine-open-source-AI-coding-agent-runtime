// kilocode_change - new file
/**
 * security:// protocol handler - resolves security/scan resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class SecurityProtocolHandler implements ProtocolHandler {
  readonly scheme = "security"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "security", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Security: ${name}`],
    }
  }
}