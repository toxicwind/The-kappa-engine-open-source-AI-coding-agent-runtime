// kilocode_change - new file
/**
 * artifact:// protocol handler - resolves build artifacts.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class ArtifactProtocolHandler implements ProtocolHandler {
  readonly scheme = "artifact"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "artifact", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Artifact: ${name}`],
    }
  }
}