// kilocode_change - new file
/**
 * issue:// and pr:// protocol handlers - resolves issue and pull request resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class IssueProtocolHandler implements ProtocolHandler {
  readonly scheme = "issue"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "issue", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Issue: ${name}`],
    }
  }
}

export class PrProtocolHandler implements ProtocolHandler {
  readonly scheme = "pr"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "pr", id: name }, null, 2),
      contentType: "application/json",
      notes: [`PR: ${name}`],
    }
  }
}