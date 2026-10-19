import { describe, expect } from "bun:test"
import { ConfigProvider, Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { RuntimeFlags } from "../../src/effect/runtime-flags.ts"
import { BoardEnabled } from "../../src/kappacode/board/enabled.ts"
import { it } from "../lib/effect.ts"

const fromEnv = (input: Record<string, unknown>) =>
  AppNodeBuilder.build(RuntimeFlags.node).pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(input))))

const resolve = (config: boolean | undefined, input: Record<string, unknown>) =>
  Effect.gen(function* () {
    const flags = yield* RuntimeFlags.Service
    return BoardEnabled.resolve({ config, flag: flags.experimentalSharedAgentBoard })
  }).pipe(Effect.provide(fromEnv(input)))

describe("shared agent board enablement", () => {
  it.effect("is enabled by default", () =>
    Effect.gen(function* () {
      expect(yield* resolve(undefined, {})).toBe(true)
    }),
  )

  it.effect("enables when the config key is true", () =>
    Effect.gen(function* () {
      expect(yield* resolve(true, {})).toBe(true)
    }),
  )

  it.effect("disables when the config key is false", () =>
    Effect.gen(function* () {
      expect(yield* resolve(false, {})).toBe(false)
    }),
  )

  it.effect("enables when the specific env flag is true", () =>
    Effect.gen(function* () {
      expect(yield* resolve(undefined, { KAPPA_EXPERIMENTAL_SHARED_AGENT_BOARD: "true" })).toBe(true)
    }),
  )

  it.effect("disables when the specific env flag is false", () =>
    Effect.gen(function* () {
      expect(yield* resolve(undefined, { KAPPA_EXPERIMENTAL_SHARED_AGENT_BOARD: "false" })).toBe(false)
    }),
  )

  it.effect("lets the env opt-out win over an explicit config enable", () =>
    Effect.gen(function* () {
      expect(yield* resolve(true, { KAPPA_EXPERIMENTAL_SHARED_AGENT_BOARD: "false" })).toBe(false)
    }),
  )

  it.effect("lets the config opt-out win over the specific env enable", () =>
    Effect.gen(function* () {
      expect(yield* resolve(false, { KAPPA_EXPERIMENTAL_SHARED_AGENT_BOARD: "true" })).toBe(false)
    }),
  )

  it.effect("stays enabled when the KAPPA_EXPERIMENTAL umbrella is true", () =>
    Effect.gen(function* () {
      expect(yield* resolve(undefined, { KAPPA_EXPERIMENTAL: "true" })).toBe(true)
    }),
  )

  it.effect("stays enabled when the KAPPA_EXPERIMENTAL umbrella is false", () =>
    Effect.gen(function* () {
      expect(yield* resolve(undefined, { KAPPA_EXPERIMENTAL: "false" })).toBe(true)
    }),
  )
})
