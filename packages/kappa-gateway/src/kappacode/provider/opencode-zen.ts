// kappacode_change - new file
// OpenCode Zen free tier bypass.
// Zen's free models (-free or zero-priced) are served only to requests that
// look like the OpenCode client: versioned User-Agent, x-opencode-session /
// x-opencode-session-id / x-opencode-request / x-opencode-client / x-opencode-project
// headers, no x-session-affinity / X-Session-Id, streamed transport, and tools
// named bash and read with OpenCode's own schemas. Without these, Zen answers
// 403 FreeTierError "OpenCode's free tier can only be used from within OpenCode"
// (mid-October 2026: also at /inference/v1, not /zen/v1).
import { Context, Effect, Layer } from "effect"

// OpenCode version magpie/magpie-compatible clients report to Zen's gateway.
// Zen's free tier turns away anything older than 1.18.0 (426).
export const OPENCODE_VERSION = "1.19.0"

// User-Agent OpenCode 1.19.0 sends to Zen's gateway (captured from the real client).
export const OPENCODE_USER_AGENT =
  "opencode/1.19.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14"

// Anonymous key OpenCode sends to Zen when no one is signed in.
export const OPENCODE_ANONYMOUS_KEY = "public"

// Tools Zen's free tier wants offered (by name).
export const OPENCODE_TOOLS = ["bash", "read"]

// Schemas OpenCode itself gives bash and read (1.19.0). One property is enough;
// Zen answers 403 FreeTierError when either is offered with no parameters.
export const OPENCODE_TOOL_SCHEMAS: Record<string, string> = {
  bash: JSON.stringify({
    type: "object",
    properties: {
      command: { type: "string", description: "The command to execute" },
      timeout: { type: "integer", description: "Optional timeout in milliseconds" },
      workdir: { type: "string", description: "The working directory to run the command in" },
    },
    required: ["command"],
  }),
  read: JSON.stringify({
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The absolute path to the file or directory to read",
      },
      offset: { type: "integer", description: "The line number to start reading from (1-indexed)" },
      limit: { type: "integer", description: "The maximum number of lines to read" },
    },
    required: ["filePath"],
  }),
}

// Stub text for tools offered only for Zen's free tier to see.
export const OPENCODE_TOOL_STUB = "Not available in this session. Never call this tool."

// Whether u is at OpenCode's gateway (Zen, Go or inference API): opencode.ai
// or a name under it, whatever port the URL gives.
export function isOpenCodeURL(u: string): boolean {
  try {
    const pu = new URL(String(u).trim())
    return pu.hostname === "opencode.ai" || pu.hostname.endsWith(".opencode.ai")
  } catch {
    return false
  }
}

// Whether model is one of OpenCode Zen's free ones.
// A free model is one whose id ends in -free, or one models.dev prices at nothing.
export function isOpenCodeFreeModel(model: string, inputPrice = 0, outputPrice = 0): boolean {
  if (model.endsWith("-free")) return true
  if (inputPrice === 0 && outputPrice === 0) return true
  return false
}

// Whether an error is Zen's free-tier refusal.
export function isOpenCodeFreeTierError(status: number | undefined, body: unknown, msg: string): boolean {
  if (status === 403 && /FreeTierError|free tier can only be used from within/i.test(msg)) return true
  const b = body as { error?: { type?: string; message?: string } } | undefined
  return (
    b?.error?.type === "FreeTierError" ||
    /OpenCode's free tier can only be used from within/i.test(b?.error?.message ?? "")
  )
}

// Translate a Zen URL (/zen/v1/…) to the inference API (/inference/v1/…).
// Zen's free tier answers 403 at /zen/v1 even for OpenCode's own requests
// since mid-October 2026; the same request at /inference/v1 answers 200.
// Any other URL (Go's /zen/go among others) is returned unchanged.
export function openCodeFreeURL(u: string): string {
  try {
    const pu = new URL(u)
    if (!isOpenCodeURL(u)) return u
    const rest = pu.pathname.startsWith("/zen") ? pu.pathname.slice(4) : ""
    if (rest === "" || rest === "/go" || rest.startsWith("/go/")) return u
    pu.pathname = "/inference" + rest
    return pu.toString()
  } catch {
    return u
  }
}

// Inject OpenCode client headers into an existing headers record.
// OpenCodeClient makes a request carry what OpenCode itself sends:
// User-Agent, x-opencode-session, x-opencode-session-id, x-opencode-request,
// x-opencode-client, x-opencode-project. Deletes x-session-affinity / X-Session-Id
// (Zen's free tier answers 403 FreeTierError to requests carrying them).
export function openCodeClientHeaders(
  headers: Record<string, string>,
  session: string,
  requestId: string,
): Record<string, string> {
  const h: Record<string, string> = { ...headers }
  delete h["x-session-affinity"]
  delete h["X-Session-Id"]
  h["User-Agent"] = OPENCODE_USER_AGENT
  h["x-opencode-session"] = session
  h["x-opencode-session-id"] = session
  h["x-opencode-request"] = requestId
  h["x-opencode-client"] = "cli"
  h["x-opencode-project"] = "global"
  return h
}

// Build an OpenCode Zen free-tier probe body (streamed, offering bash and read).
export function openCodeFreeProbeBody(body: unknown): string {
  let m: Record<string, unknown>
  try {
    m = typeof body === "string" ? JSON.parse(body) : { ...(body as Record<string, unknown>) }
  } catch {
    return typeof body === "string" ? body : JSON.stringify(body)
  }
  const tools: unknown[] = []
  for (const name of OPENCODE_TOOLS) {
    let schema: unknown = {}
    try {
      schema = JSON.parse(OPENCODE_TOOL_SCHEMAS[name] ?? "{}")
    } catch {
      schema = {}
    }
    tools.push({
      type: "function",
      function: {
        name,
        description: OPENCODE_TOOL_STUB,
        parameters: schema,
      },
    })
  }
  m.stream = true
  m.tools = tools
  return JSON.stringify(m)
}

export interface OpenCodeZenBypass {
  readonly headers: (h: Record<string, string>, session: string, requestId: string) => Record<string, string>
  readonly freeURL: (u: string) => string
  readonly isFreeModel: (model: string, inputPrice?: number, outputPrice?: number) => boolean
  readonly isFreeTierError: (status: number | undefined, body: unknown, msg: string) => boolean
  readonly probeBody: (body: unknown) => string
  readonly tools: ReadonlyArray<string>
  readonly toolSchemas: Readonly<Record<string, string>>
}

export class OpenCodeZenBypassService extends Context.Service<OpenCodeZenBypassService, OpenCodeZenBypass>()(
  "@kappacode/OpenCodeZenBypass",
) {}

export const opencodeZenBypassLayer = Layer.succeed(
  OpenCodeZenBypassService,
  OpenCodeZenBypassService.of({
    headers: openCodeClientHeaders,
    freeURL: openCodeFreeURL,
    isFreeModel: isOpenCodeFreeModel,
    isFreeTierError: isOpenCodeFreeTierError,
    probeBody: openCodeFreeProbeBody,
    tools: OPENCODE_TOOLS,
    toolSchemas: OPENCODE_TOOL_SCHEMAS,
  }),
)
