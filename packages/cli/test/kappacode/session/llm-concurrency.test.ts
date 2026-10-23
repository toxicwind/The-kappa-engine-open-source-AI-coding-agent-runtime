import { expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { Permission } from "@/permission"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { MemoryService } from "@kappacode/kappa-memory/effect/service"
import { BackgroundJob } from "@/background/job"
import { KappaSessions } from "@/kappa-sessions/kappa-sessions"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { provideTmpdirServer } from "../../fixture/fixture.ts"
import { awaitWithTimeout, testEffect } from "../../lib/effect.ts"
import { reply, TestLLMServer } from "../../lib/llm-server.ts"
import { LLMQueue, DEFAULT_MAX_CONCURRENCY } from "@/kappacode/session/llm/queue"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionPrompt.node,
      SessionProjector.node,
      Session.node,
      SessionStatus.node,
      Permission.node,
      BackgroundJob.node,
      Database.node,
      CrossSpawnSpawner.node,
      LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
      LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] }),
    ]),
    [[KappaSessions.node, KappaSessions.testLayer]],
  ),
)

function matches(body: Record<string, unknown>, text: string) {
  if (!Array.isArray(body.messages)) return false
  const user = body.messages.findLast((message) => message.role === "user")
  return JSON.stringify(user?.content)?.includes(text) ?? false
}

function config(url: string, maxConcurrency = DEFAULT_MAX_CONCURRENCY) {
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
  it("server has no in-flight cap by default", () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(2)
  })

  it("reports the configured concurrency ceiling for a provider", () =>
    provideTmpdirServer(
      () =>
        Effect.gen(function* () {
          const queue = yield* LLMQueue
          const cap = yield* queue.concurrency("test")
          expect(cap).toBe(DEFAULT_MAX_CONCURRENCY)
        }),
      { config: config("http://127.0.0.1:1") },
    ))

  it(
    "holds concurrent streams to the provider-wide max, letting queued streams through as prior ones finish",
    () =>
      provideTmpdirServer(
        () =>
          Effect.gen(function* () {
            const prompt = yield* SessionPrompt.Service
            const sessions = yield* Session.Service
            const llm = yield* TestLLMServer
            const queue = yield* LLMQueue
            expect((yield* queue.concurrency("test")) > 1).toBe(true)

            const first = Promise.withResolvers<void>()
            const second = Promise.withResolvers<void>()
            const third = Promise.withResolvers<void>()

            // Three concurrent turns all address the SAME provider ("test").
            // With maxConcurrency=2 the mock must see only 2 in flight until one
            // completes; the 3rd request lines up on the provider-wide queue.
            yield* llm.pushMatch(({ body }) => matches(body, "FIRST"), reply().wait(first.promise).text("r1").stop())
            yield* llm.pushMatch(({ body }) => matches(body, "SECOND"), reply().wait(second.promise).text("r2").stop())
            yield* llm.pushMatch(({ body }) => matches(body, "THIRD"), reply().wait(third.promise).text("r3").stop())

            const make = (text: string) =>
              Effect.gen(function* () {
                const s = yield* sessions.create({ title: text })
                yield* prompt.prompt({ sessionID: s.id, parts: [{ type: "text", text }] })
              })

            const a = yield* make("FIRST").pipe(Effect.forkScoped)
            const b = yield* make("SECOND").pipe(Effect.forkScoped)
            const c = yield* make("THIRD").pipe(Effect.forkScoped)

            // Give the two queued requests time to reach the server; the third
            // must still be waiting on the semaphore, so the mock has seen 2.
            yield* awaitWithTimeout(llm.wait(2), "two requests did not reach the mock", "15 seconds")
            expect(yield* llm.calls).toBe(2)

            first.resolve()
            yield* awaitWithTimeout(
              llm.wait(3),
              "third request was not let through after the queue freed",
              "15 seconds",
            )
            expect(yield* llm.calls).toBe(3)

            second.resolve()
            third.resolve()
            yield* Effect.all([Fiber.join(a), Fiber.join(b), Fiber.join(c)])
          }),
        { config: config("http://127.0.0.1:1", 2) },
      ),
    30000,
  )
})
