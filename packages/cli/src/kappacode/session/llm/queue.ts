import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Config } from "@/config/config"
import { Context, Effect, Layer, Ref, Semaphore } from "effect"

/**
 * Per-provider LLM concurrency queue, shared by the PROVIDER as a whole.
 *
 * A "429 with retry-after:1" from proxied tool calls is usually the local
 * Thresher/limiter shedding excess concurrency, not a provider rate limit. So
 * instead of an endless retry loop spelling against the shed, we never exceed
 * the provider's client-side concurrency ceiling in the first place: every
 * in-flight LLM request for a provider waits on ONE shared semaphore sized by
 * that provider's `maxConcurrency` (default 2).
 *
 * Sharing (the important part): requests for one provider can arrive from many
 * places at once — multiple interactive sessions, the HTTP/SSE server, and a
 * separate AppRuntime built around LLM.node (e.g. plan-followup). All models
 * under the same providerID (freeinference bundles qwen/glm/deepseek/minimax)
 * share ONE provider-wide permit and line up together; a genuinely different
 * provider gets its own semaphore. We pin the registry to a PROCESS-GLOBAL
 * store so every LLMQueue instance — across every session and every runtime —
 * gates the same per-provider semaphore, throttling the provider as a whole.
 *
 * `acquire` (wait for a free permit) / `release` (return it) are reservation
 * primitives so a caller can hold a permit across a whole stream lifecycle with
 * Effect.acquireRelease; `withPermit` is the whole-effect convenience form.
 */
export const DEFAULT_MAX_CONCURRENCY = 2 /* legacy sentinel — actual default flows through ConfigV1.defaultMaxConcurrency */

/** Sentinel shared by every LLMQueue instance. Holds semaphore-per-provider. */
// kilocode_change - module-scope singleton: Ref.make returns an Effect, Ref.makeUnsafe returns a Ref.
const globalRef = Ref.makeUnsafe(new Map<string, Semaphore.Semaphore>())

function entry(id: string, cap: number) {
  return Ref.modify(globalRef, (map) => {
    const cur = map.get(id)
    if (cur) return [cur, map] as const
    const next = Semaphore.make(Math.max(1, cap)).pipe(Effect.runSync)
    return [next, new Map(map).set(id, next)] as const
  })
}

export class LLMQueue extends Context.Service<
  LLMQueue,
  {
    /** Current max-concurrency ceiling configured for a provider. */
    readonly concurrency: (providerID: string) => Effect.Effect<number>
    /** Resolve when a permit for `providerID` is free; holds it until you call release. */
    readonly acquire: (providerID: string) => Effect.Effect<void>
    /** Return the permit held from acquire. */
    readonly release: (providerID: string) => Effect.Effect<void>
    /** Run `effect` under a permit, releasing it when `effect` completes. */
    readonly withPermit: (providerID: string, effect: Effect.Effect<unknown, unknown>) => Effect.Effect<unknown, unknown>
  }
>()("@kappacode/LLMQueue") {}

export const live = LayerNode.make({
  service: LLMQueue,
  layer: Layer.effect(
    LLMQueue,
    Effect.gen(function* () {
      const config = yield* Config.Service

      const count = (providerID: string) =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          return (
            cfg.provider?.[providerID]?.options?.maxConcurrency ?? cfg.defaultMaxConcurrency ?? DEFAULT_MAX_CONCURRENCY
          )
        })

      const sem = (providerID: string, cap: number) => entry(providerID, cap)

      const acquire = (providerID: string) =>
        Effect.gen(function* () {
          const cap = yield* count(providerID)
          const s = yield* sem(providerID, cap)
          yield* s.take(1)
        })

      const release = (providerID: string) =>
        Effect.gen(function* () {
          const cap = yield* count(providerID)
          const s = yield* sem(providerID, cap)
          yield* s.release(1)
        })

      const withPermit = (providerID: string, effect: Effect.Effect<unknown, unknown>) =>
        Effect.gen(function* () {
          const cap = yield* count(providerID)
          const s = yield* sem(providerID, cap)
          return yield* s.withPermits(1)(effect)
        })

      return LLMQueue.of({
        concurrency: (id) => count(id),
        acquire,
        release,
        withPermit,
      })
    }),
  ),
  deps: [Config.node],
})

export const node = live
