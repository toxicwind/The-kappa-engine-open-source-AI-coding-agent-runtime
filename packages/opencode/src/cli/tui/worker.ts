import { Server } from "@/server/server"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Rpc } from "@/util/rpc"
import { upgrade } from "@/cli/upgrade"
import { Config } from "@/config/config"
import { GlobalBus } from "@/bus/global"
import { ServerAuth } from "@/server/auth"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { KappaLog } from "@/kappacode/log" // kappacode_change
import * as Log from "@opencode-ai/core/util/log" // kappacode_change
import { ensureProcessMetadata } from "@opencode-ai/core/util/opencode-process" // kappacode_change
import { createWorkerRemoteExit } from "@/kappacode/cli/cmd/tui/remote-exit-worker" // kappacode_change
import { createWorkerShutdown } from "@/cli/tui/worker-shutdown" // kappacode_change
import { KappaSessions } from "@/kappa-sessions/kappa-sessions" // kappacode_change
import { KappaRpc } from "@/kappacode/util/rpc" // kappacode_change

// kappacode_change start - queue parent requests before the await below; KappaRpc.listen replays them
KappaRpc.arm()
// kappacode_change end

ensureProcessMetadata("worker") // kappacode_change - retain worker role and parent run correlation
await KappaLog.init() // kappacode_change - keep compatibility logs off the TUI terminal
Heap.start()

// kappacode_change start - startup checkpoints: these separate "worker never started" from
// "worker up but RPC stuck", which is how the release PTY smoke stall was localised
const log = Log.create({ service: "tui-worker" })
log.info("worker booted")
// kappacode_change end

// kappacode_change start - keep upstream's keep-alive intent but never swallow the error silently
const onUnhandledRejection = (error: unknown) => {
  console.error("worker unhandledRejection", error)
}

const onUncaughtException = (error: Error) => {
  console.error("worker uncaughtException", error)
}
// kappacode_change end

process.on("unhandledRejection", onUnhandledRejection)
process.on("uncaughtException", onUncaughtException)

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

let server: Awaited<ReturnType<typeof Server.listen>> | undefined
const remoteExit = createWorkerRemoteExit(Rpc.emit) // kappacode_change
// kappacode_change start - drain ingest before dispose so GlobalBus/remote stay live
const runShutdown = createWorkerShutdown({
  drain: () => KappaSessions.drainIngestForShutdown(),
  dispose: () => InstanceRuntime.disposeAllInstances(),
  stopServer: async () => {
    if (server) await server.stop(true)
    process.off("unhandledRejection", onUnhandledRejection)
    process.off("uncaughtException", onUncaughtException)
  },
})
// kappacode_change end

export const rpc = {
  // kappacode_change start - worker lifecycle hooks for remote exit
  tuiReady() {
    remoteExit.ready()
  },
  tuiGone() {
    remoteExit.gone()
  },
  // kappacode_change end
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = ServerAuth.header()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const response = await Server.Default().app.fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    server = await Server.listen(input)
    return { url: server.url.toString() }
  },
  async checkUpgrade(input: { directory: string }) {
    await InstanceRuntime.load({ directory: input.directory })
    await upgrade().catch(() => {})
  },
  async reload() {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const cfg = yield* Config.Service
        yield* cfg.invalidate()
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      }),
    )
  },
  async shutdown() {
    remoteExit.shutdown() // kappacode_change
    await runShutdown() // kappacode_change - drain → dispose → stopServer
    // kappacode_change start - Clear the Rpc message channel so the worker's event loop can drain and
    // exit naturally. Without this, the active onmessage handle keeps the
    // worker alive even after all async work is done.
    onmessage = null
    // kappacode_change end
  },
}

// kappacode_change start - KappaRpc.listen replays queued requests and announces readiness
KappaRpc.listen(rpc)
log.info("worker listening") // checkpoint, see the note above KappaRpc.arm
// kappacode_change end
