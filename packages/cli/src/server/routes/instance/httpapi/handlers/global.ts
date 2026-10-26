import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Installation } from "@/installation"
import { disconnect } from "@/kappacode/server/sse" // kappacode_change
import { copied } from "@/kappacode/event-wire" // kappacode_change
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/http" // kappacode_change - raw request needed for Kappa SSE
import { HttpApiBuilder } from "effect/http-api"
import * as Sse from "effect/encoding/Sse"
import { RootHttpApi } from "../api.ts"
import { GlobalUpgradeInput } from "../groups/global.ts"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

// kappacode_change start
function eventResponse(request: HttpServerRequest.HttpServerRequest) {
  return Effect.gen(function* () {
    // kappacode_change end
    yield* Effect.logInfo("global event connected")
    const events = Stream.callback<GlobalBusEvent>((queue) => {
      // kappacode_change start
      const handler = (event: GlobalBusEvent) => {
        if (request.headers["x-kappa-sse-skip-fork-sync"] === "1" && copied in event) return
        Queue.offerUnsafe(queue, event)
      }
      // kappacode_change end
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", handler)),
        () => Effect.sync(() => GlobalBus.off("event", handler)),
      )
    })
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => ({ payload: { id: EventV2.ID.create(), type: "server.heartbeat", properties: {} } })),
    )

    return HttpServerResponse.stream(
      Stream.make({ payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} } }).pipe(
        Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        // kappacode_change start - prevent disconnected SSE clients from retaining full diff payloads
        // Explicit interruption closes the stream scope, unregisters its GlobalBus listener, and
        // releases the unbounded callback queue even when transport cancellation is not propagated.
        Stream.interruptWhen(disconnect(request)),
        // kappacode_change end
        Stream.ensuring(Effect.logInfo("global event disconnected")),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    const bridge = yield* EffectBridge.make()

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest // kappacode_change
      return yield* eventResponse(request) // kappacode_change
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      // kappacode_change start
      if (result.changed) {
        yield* bridge.run(
          disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }).pipe(Effect.catchCause(() => Effect.void)),
        )
      }
      // kappacode_change end
      return result.info
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: {
      // kappacode_change start - a bodyless request decodes to no payload
      payload?: void | typeof GlobalUpgradeInput.Type
      // kappacode_change end
    }) {
      const method = yield* installation.method()
      if (method === "unknown") {
        return HttpServerResponse.jsonUnsafe(
          { success: false as const, error: "Unknown installation method" },
          { status: 400 },
        )
      }
      const requested = ctx.payload ? ctx.payload.target : undefined // kappacode_change - a bodyless request has no payload
      const target = requested || (yield* installation.latest(method)) // kappacode_change - omitted target upgrades to the latest version
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ success: true as const, version: target }),
        Effect.catch((err) =>
          Effect.succeed({
            success: false as const,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
      if (!result.success) return HttpServerResponse.jsonUnsafe(result, { status: 500 })
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return HttpServerResponse.jsonUnsafe(result)
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("dispose", dispose)
      .handle("upgrade", upgrade)
  }),
)
