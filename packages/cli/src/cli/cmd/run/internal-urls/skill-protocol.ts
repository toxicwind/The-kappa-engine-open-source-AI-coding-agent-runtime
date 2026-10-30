// kilocode_change - new file
/**
 * skill:// protocol handler - resolves skill resources.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class SkillProtocolHandler implements ProtocolHandler {
  readonly scheme = "skill"
  readonly immutable = true

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    return {
      url: url.href,
      content: JSON.stringify({ kind: "skill", id: name }, null, 2),
      contentType: "application/json",
      notes: [`Skill: ${name}`],
    }
  }
}