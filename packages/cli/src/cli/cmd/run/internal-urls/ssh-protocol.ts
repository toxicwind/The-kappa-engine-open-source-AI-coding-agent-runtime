// kilocode_change - new file
/**
 * ssh:// protocol handler - resolves SSH host resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class SshProtocolHandler implements ProtocolHandler {
  readonly scheme = "ssh"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const host = url.rawHost || (url.hostname ?? "")
    const path = url.rawPathname ?? url.pathname ?? ""
    return {
      url: url.href,
      content: JSON.stringify({ kind: "ssh", host, path }, null, 2),
      contentType: "application/json",
      notes: [`SSH: ${host}${path}`],
    }
  }
}