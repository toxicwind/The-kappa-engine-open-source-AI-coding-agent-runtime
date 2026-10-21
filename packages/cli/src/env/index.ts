import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { InstanceState } from "@/effect/instance-state"
import { resolveAllProviderKeys } from "@/kappacode/secrets"

type State = Record<string, string | undefined>

export interface Interface {
  readonly get: (key: string) => Effect.Effect<string | undefined>
  readonly all: () => Effect.Effect<State>
  readonly set: (key: string, value: string) => Effect.Effect<void>
  readonly remove: (key: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Env") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = yield* InstanceState.make<State>(
      Effect.fn("Env.state")(function* () {
        const env: State = { ...process.env }
        // auto-detect via secretsmith - never throws
        let providerKeys: Record<string, string> = {}
        try {
          providerKeys = yield* Effect.promise(() => resolveAllProviderKeys())
        } catch (e) {
          console.error("[kappa env] resolveAllProviderKeys failed, continuing with process.env only:", e)
        }
        for (const [k, v] of Object.entries(providerKeys)) {
          if (!v) continue
          if (!env[k]) env[k] = v
        }
        return env
      }),
    )

    const get = Effect.fn("Env.get")((key: string) => InstanceState.use(state, (env) => env[key]))
    const all = Effect.fn("Env.all")(() => InstanceState.get(state))
    const set = Effect.fn("Env.set")(function* (key: string, value: string) {
      const env = yield* InstanceState.get(state)
      env[key] = value
    })
    const remove = Effect.fn("Env.remove")(function* (key: string) {
      const env = yield* InstanceState.get(state)
      delete env[key]
    })

    return Service.of({ get, all, set, remove })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [] })

export * as Env from "./index.ts"
