// kilocode_change - new file
/**
 * local:// protocol handler - resolves local filesystem paths relative to
 * the calling session's cwd.
 */
import { join } from "node:path"
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext } from "./types"

export class LocalProtocolHandler implements ProtocolHandler {
  readonly scheme = "local"
  readonly immutable = false

  async resolve(url: InternalUrl, context?: ResolveContext): Promise<InternalResource> {
    const id = url.rawPathname ?? url.pathname ?? ""
    const name = id.replace(/^\//, "")
    const cwd = context?.cwd || process.cwd()
    const abs = pathIsAbsolute(name) ? name : join(cwd, name)
    return {
      url: url.href,
      content: JSON.stringify({ kind: "local", path: abs }, null, 2),
      contentType: "application/json",
      sourcePath: abs,
      notes: [`Local: ${abs}`],
    }
  }
}

function pathIsAbsolute(p: string): boolean {
  return p.startsWith("/") || (p.length > 1 && p[1] === ":")
}