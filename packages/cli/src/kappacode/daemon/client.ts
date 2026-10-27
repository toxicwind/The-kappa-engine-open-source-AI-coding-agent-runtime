import * as Log from "@opencode-ai/core/util/log"
import { Daemon } from "./daemon.ts"

export namespace DaemonClient {
  const log = Log.create({ service: "daemon.client" })

  export type Connection = {
    url: string
    headers: Record<string, string>
    state: Daemon.State
  }

  export function enabled() {
    return !process.env.KAPPA_NO_DAEMON
  }

  export function headers(state: Daemon.State) {
    return { Authorization: `Basic ${state.token}` }
  }

  export async function connect(): Promise<Connection | undefined> {
    if (!enabled()) return undefined
    const daemon = await Daemon.status()
    if (!daemon.running || !daemon.state) return undefined
    return {
      url: daemon.state.url,
      headers: headers(daemon.state),
      state: daemon.state,
    }
  }

  export async function maybe(): Promise<Connection | undefined> {
    return await connect().catch((err) => {
      log.warn("daemon unavailable, falling back to embedded server", { err })
      return undefined
    })
  }

  // kappacode_change start - boot-or-reuse: connect to the running daemon, or
  // ensure one exists (Daemon.ensure reuses a healthy daemon, boots otherwise).
  // Explicit network flags (passed via input) mean the caller owns the server
  // topology — those go through Daemon.ensure with the explicit options, never
  // silently reused defaults.
  export async function start(options: { port?: number; hostname?: string; mdns?: boolean } = {}): Promise<Connection | undefined> {
    if (!enabled()) return undefined
    const { Daemon } = await import("./daemon")
    const explicit = [
      ...(options.port != null ? (["port"] as const) : []),
      ...(options.hostname != null ? (["hostname"] as const) : []),
      ...(options.mdns != null ? (["mdns"] as const) : []),
    ]
    // Daemon.Options requires the full Network set; fill the fields the caller
    // did not pass with the CLI network defaults (see src/cli/network.ts) so
    // Daemon.ensure's Network.parse never sees a partial object. `explicit`
    // still records only the caller-passed flags, so reuse matching is
    // unaffected by the filled defaults.
    const opts: Daemon.Options = {
      hostname: "127.0.0.1",
      port: 0,
      mdns: false,
      mdnsDomain: "kappa.local",
      cors: [],
      ...(options.port != null ? { port: options.port } : {}),
      ...(options.hostname != null ? { hostname: options.hostname } : {}),
      ...(options.mdns != null ? { mdns: options.mdns } : {}),
    }
    const ensured = await Daemon.ensure(opts, explicit)
    const state = ensured.result.state
    if (!state) {
      log.warn("daemon ensure produced no state, falling back to embedded server")
      return undefined
    }
    return { url: state.url, headers: headers(state), state }
  }
}
