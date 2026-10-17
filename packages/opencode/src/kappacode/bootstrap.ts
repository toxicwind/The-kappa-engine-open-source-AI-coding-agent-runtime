import { Cause, Context, Effect, Layer } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { KiloSessions } from "@/kappa-sessions/kappa-sessions"
import * as Log from "@opencode-ai/core/util/log"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import path from "node:path"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { SessionSummary } from "@/session/summary"
import { SessionExport } from "@/kappacode/session-export"
import { createWorkspaceProvider } from "@/kappacode/session-export/workspace-provider"
import { Instance } from "@/kappacode/instance"
import { InstanceRef } from "@/effect/instance-ref"
import { Identity } from "@kappacode/kappa-telemetry"
import { MemoryLifecycle } from "@/kappacode/memory/turn"
import { MemoryService } from "@kappacode/kappa-memory/effect/service"
import { MemoryEvents } from "@/kappacode/memory/events"
import { installMemoryRuntime } from "@/kappacode/memory/runtime"
import { KiloToolRegistry } from "@/kappacode/tool/registry"
import { Wakeup } from "@/kappacode/wakeup"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { KilocodeWatcher } from "@/kappacode/watcher"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder" // kappacode_change

const log = Log.create({ service: "kappacode-bootstrap" })

export namespace KilocodeBootstrap {
  export interface Interface {
    readonly init: () => Effect.Effect<void, unknown>
  }

  export class Service extends Context.Service<Service, Interface>()("@kappacode/Bootstrap") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      // Bind the package memory effect layer to opencode (paths, instance binder, logger, event sink).
      installMemoryRuntime()
      const kappa = yield* KiloSessions.Service
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      const summary = yield* SessionSummary.Service
      const provider = yield* Provider.Service
      const config = yield* Config.Service
      const memory = yield* MemoryService.Service
      const watcher = yield* KilocodeWatcher.Service
      const wake = yield* Wakeup.Service

      const init = Effect.fn("KilocodeBootstrap.init")(function* () {
        yield* watcher.init()
        yield* kappa.init()
        yield* MemoryLifecycle.subscribe({ bus, sessions, summary, provider, config, memory })
        // Invalidate enabled cache on every memory state mutation (properties.directory holds the memory root).
        yield* bus.subscribeCallback(MemoryEvents.Status, (evt) =>
          KiloToolRegistry.invalidateMemoryEnabled(evt.properties.directory),
        )
        yield* bus.subscribeCallback(MemoryEvents.Updated, (evt) =>
          KiloToolRegistry.invalidateMemoryEnabled(evt.properties.directory),
        )
        // Re-arm this directory's persisted wakeups on every instance start: overdue ones
        // fire immediately, the rest get their timers. A failure must not block bootstrap.
        const inst = yield* InstanceRef
        if (inst) {
          yield* wake.adopt(inst.directory).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => log.warn("wakeup adopt failed", { err: Cause.squash(cause) })),
            ),
          )
        }
        // Session export bootstrap.
        yield* Effect.gen(function* () {
          if (!SessionExport.enabled) return
          const anon = yield* EffectBridge.fromPromise(() =>
            Identity.getMachineId().catch((err) => {
              log.warn("session export identity failed", { err })
              return undefined
            }),
          )
          SessionExport.init({
            agentVersion: InstallationVersion,
            anonId: anon,
            dbPath: path.join(Global.Path.data, "session-export.db"),
            workspaceKey: Instance.directory,
            subscribeAll: (cb) => Bus.subscribeAll(cb),
            snapshotProvider: createWorkspaceProvider({
              root: Instance.directory,
              statePath: path.join(Global.Path.data, "session-export-workspace.json"),
            }),
          })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => log.warn("session export bootstrap failed", { err: Cause.squash(cause) })),
          ),
        )
        if (process.env["KILO_PLATFORM"] !== "vscode") {
          yield* EffectBridge.fromPromise(() =>
            import("@/kappacode/indexing").then((mod) => mod.KiloIndexing.init()),
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => log.warn("indexing bootstrap failed", { err: Cause.squash(cause) })),
            ),
            Effect.forkDetach,
          )
        }
      })

      return Service.of({ init })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide([
      KiloSessions.defaultLayer,
      Session.defaultLayer,
      AppNodeBuilder.build(SessionSummary.node),
      AppNodeBuilder.build(Provider.node),
      AppNodeBuilder.build(Config.node),
      MemoryService.layer,
      Bus.defaultLayer,
      KilocodeWatcher.defaultLayer,
      AppNodeBuilder.build(Wakeup.node),
    ]),
  )

  const memory = LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] })
  const watcher = LayerNode.make({ service: KilocodeWatcher.Service, layer: KilocodeWatcher.defaultLayer, deps: [] })
  export const node = LayerNode.suspend(() =>
    LayerNode.make({
      service: Service,
      layer,
      deps: [
        KiloSessions.node,
        Session.node,
        SessionSummary.node,
        Provider.node,
        Config.node,
        memory,
        Bus.node,
        watcher,
        Wakeup.node,
      ],
    }),
  )
}
