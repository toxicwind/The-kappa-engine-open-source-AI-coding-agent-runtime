import { describe, expect, test } from "bun:test"
import { Effect, Layer, Option } from "effect"
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

function config(url: string, maxConcurrency: number) {
  return {
    model: "test/test-model",
    enabled_providers: ["test"],
    snapshot: false,
    subagent_depth: 3,
    permission: { "*": "allow" as const },
    provider: {
      test: {
        npm: "@ai-sdk/openai-compatible",
        maxConcurrency,
        models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
        options: { apiKey: "test-key", baseURL: url },
      },
    },
  }
}

describe("provider-wide LLM concurrency queue", () => {
  test("the default ceiling is positive", () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBeGreaterThanOrEqual(1)
  })

  it.live("reports the configured concurrency ceiling for a provider", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(DEFAULT_MAX_CONCURRENCY)
        }),
      { config: (url: string) => config(url, DEFAULT_MAX_CONCURRENCY) },
    ),
  )

  it.live(
    "bounds in-flight acquires to the provider-wide max, letting a queued waiter through after a release",
    () =>
      provideTmpdirServer(
        () =>
          Effect.gen(function* () {
            const queue = yield* LLMQueue
            const cap = yield* queue.concurrency("test")
            expect(cap).toBe(DEFAULT_MAX_CONCURRENCY)

            // Grab every permit so the provider is saturated.
            const laps = yield* Effect.all(
              Array.from({ length: cap }, () => queue.acquire("test").pipe(Effect.succeed)),
            )
            expect(laps.length).toBe(cap)

            // Release one permit; a queued acquire proceeds (no provider drop).
            yield* queue.release("test")
            yield* queue.acquire("test")
          }),
        { config: (url: string) => config(url, DEFAULT_MAX_CONCURRENCY) },
      ),
    30000,
  )
})
