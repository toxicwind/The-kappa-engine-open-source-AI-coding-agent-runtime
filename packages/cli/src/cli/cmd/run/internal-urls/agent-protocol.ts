// kilocode_change - new file
/**
 * agent:// protocol handler - resolves agent session resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class AgentProtocolHandler implements ProtocolHandler {
  readonly scheme = "agent"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "agent", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Agent: ${name}`],
    }
  }
}