// kilocode_change - new file
/**
 * vault:// protocol handler - resolves vault/secret resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class VaultProtocolHandler implements ProtocolHandler {
  readonly scheme = "vault"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "vault", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Vault: ${name}`],
    }
  }
}