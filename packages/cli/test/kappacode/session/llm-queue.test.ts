import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Permission } from "@/permission"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Memory } from "@opencode-ai/core/memory"
import { MemoryService } from "@kappacode/kappa-memory/effect/service"
import { BackgroundJob } from "@/background/job"
import { KappaSessions } from "@/kappa-sessions/kappa-sessions"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { provideTmpdirServer } from "../../fixture/fixture.ts"
import { testEffect } from "../../lib/effect.ts"
import { TestLLMServer } from "../../lib/llm-server.ts"
import { LLMQueue, node as LLMQueueNode, DEFAULT_MAX_CONCURRENCY } from "@/kappacode/session/llm/queue"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionProjector.node,
      Session.node,
      SessionStatus.node,
      Permission.node,
      BackgroundJob.node,
      Database.node,
      CrossSpawnSpawner.node,
      LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
      Memory.node,
      LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] }),
      LLMQueueNode,
    ]),
    [[KappaSessions.node, KappaSessions.testLayer]],
  ),
)

function config(url: string, maxConcurrency: number, defaultMaxConcurrency?: number) {
  return {
    model: "test/test-model",
    enabled_providers: ["test"],
    snapshot: false,
    subagent_depth: 3,
    permission: { "*": "allow" as const },
    ...(defaultMaxConcurrency !== undefined ? { defaultMaxConcurrency } : {}),
    provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
        options: { apiKey: "test-key", baseURL: url, ...(maxConcurrency !== 0 && { maxConcurrency }) },
      },
    },
  }
}

describe("LLMQueue concurrency reporting", () => {
  it.live("reports the configured concurrency ceiling for a provider", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(2)
        }),
      { config: (url: string) => config(url, 2) },
    ),
  )

  it.live("uses maxConcurrency from provider config", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(5)
        }),
      { config: (url: string) => config(url, 5) },
    ),
  )

  it.live("concurrency reports configured per-provider value (alias test)", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(2)
        }),
      { config: (url: string) => config(url, 2) },
    ),
  )

  it.live("falls back to top-level defaultMaxConcurrency when provider has no per-provider maxConcurrency", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(4)
        }),
      { config: (url: string) => config(url, 0, 4) },
    ),
  )
})

describe("LLMQueue provider isolation", () => {
  it.live("different providers get separate semaphores with different caps", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const capA = yield* queue.concurrency("alpha")
          const capB = yield* queue.concurrency("beta")
          expect(capA).toBe(3)
          expect(capB).toBe(1)
        }),
      {
        config: (url: string) => ({
          model: "test/test-model",
          enabled_providers: ["alpha", "beta"],
          snapshot: false,
          subagent_depth: 3,
          permission: { "*": "allow" as const },
          provider: {
            alpha: {
              npm: "@ai-sdk/openai-compatible",
              models: { "model-a": { name: "A", limit: { context: 100000, output: 10000 } } },
              options: { apiKey: "a", baseURL: url, maxConcurrency: 3 },
            },
            beta: {
              npm: "@ai-sdk/openai-compatible",
              models: { "model-b": { name: "B", limit: { context: 100000, output: 10000 } } },
              options: { apiKey: "b", baseURL: url, maxConcurrency: 1 },
            },
          },
        }),
      },
    ),
  )

  it.live("concurrency falls back to defaultMaxConcurrency when provider lacks maxConcurrency", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("fallback")
          expect(cap).toBe(4)
        }),
      {
        config: (url: string) => ({
          model: "test/test-model",
          enabled_providers: ["fallback"],
          snapshot: false,
          subagent_depth: 3,
          permission: { "*": "allow" as const },
          defaultMaxConcurrency: 4,
          provider: {
            fallback: {
              npm: "@ai-sdk/openai-compatible",
              models: { model: { name: "M", limit: { context: 100000, output: 10000 } } },
              options: { apiKey: "k", baseURL: url },
            },
          },
        }),
      },
    ),
  )
})

describe("LLMQueue default", () => {
  test("DEFAULT_MAX_CONCURRENCY is a positive integer", () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(2)
  })
})
