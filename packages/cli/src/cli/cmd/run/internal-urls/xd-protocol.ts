// kilocode_change - new file
/**
 * xd:// protocol handler.
 *
 * Routes session-bound virtual tool devices through `xd://` URLs.
 *
 * URL forms:
 *   - xd://                 → mounted tool device listing (discovery)
 *   - xd://<tool>           → tool docs + JSON parameter schema
 *   - xd://<tool>/<topic>   → tool doc topic
 *
 * Writes:
 *   - write xd://<tool>     → execute: `content` is the JSON args object
 *
 * Direct and device dispatch share one canonical tool map. The mounted-name
 * set controls presentation only; dispatch accepts the enabled union of
 * top-level active and mounted names.
 */
import type { InternalResource, InternalUrl, ProtocolHandler, ResolveContext, WriteContext } from "./types"

function parseXdUrl(href: string): { name: string } | null {
  const m = href.match(/^xd:\/\/?([^/?#]+)(?:\/([^?#]*))?(?:\?[^#]*)?(?:#.*)?$/)
  if (!m) return null
  return { name: m[1] }
}

function parseXdTopicUrl(href: string): { name: string; topic: string } | null {
  const m = href.match(/^xd:\/\/?([^/?#]+)\/([^?#]*)(?:\?[^#]*)?(?:#.*)?$/)
  if (!m) return null
  return { name: m[1], topic: m[2] }
}

/**
 * Routes session-bound virtual tool devices through `xd://` URLs.
 */
export class XdProtocolHandler implements ProtocolHandler {
  readonly scheme = "xd"
  readonly immutable = true

  constructor(private xd: { read(name: string): Promise<string>; topic(name: string, topic: string): Promise<string>; write(name: string, content: string): Promise<void> }) {}

  async resolve(url: InternalUrl, _context?: ResolveContext): Promise<InternalResource> {
    const topic = parseXdTopicUrl(url.href)
    const device = topic ? null : parseXdUrl(url.href)
    let content: string
    if (topic) {
      content = await this.xd.topic(topic.name, topic.topic)
    } else if (device) {
      content = await this.xd.read(device.name)
    } else {
      throw new Error(`Invalid xd:// URL: ${url.href}. Use xd://, xd://<tool>, or xd://<tool>/<topic>.`)
    }
    return { url: url.href, content, contentType: "text/plain", size: Buffer.byteLength(content) }
  }

  async write(url: InternalUrl, content: string, _context?: WriteContext): Promise<void> {
    const target = parseXdUrl(url.href)
    if (!target) {
      throw new Error(`Invalid xd:// URL: ${url.href}. Use xd://<tool>.`)
    }
    await this.xd.write(target.name, content)
  }
}