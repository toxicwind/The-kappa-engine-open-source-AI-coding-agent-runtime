import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Agent } from "@/agent/agent"
import type { Tool } from "@/tool/tool"
import * as Truncate from "@/tool/truncate"
import { MemoryRecallTool } from "@/kappacode/tool/memory-recall"
import { MessageID, SessionID } from "@/session/schema"
import { Service as CoreMemory, type Interface as CoreMemoryInterface, type MemoryEntry } from "@opencode-ai/core/memory"

const info = {
  name: "code",
  mode: "primary",
  options: {},
  permission: {},
} as Agent.Info

const agents = Agent.Service.of({
  get: () => Effect.succeed(info),
  list: () => Effect.succeed([info]),
  defaultInfo: () => Effect.succeed(info),
  defaultAgent: () => Effect.succeed("code"),
  generate: () => Effect.succeed({ identifier: "code", whenToUse: "", systemPrompt: "" }),
})

const truncate = Truncate.Service.of({
  cleanup: () => Effect.void,
  write: () => Effect.succeed(""),
  output: (text) => Effect.succeed({ content: text, truncated: false }),
  limits: () => Effect.succeed({ maxLines: Truncate.MAX_LINES, maxBytes: Truncate.MAX_BYTES }),
})

function makeMemory(overrides: Partial<CoreMemoryInterface> = {}) {
  return CoreMemory.of({
    retain: (input) =>
      Effect.succeed({
        id: "mem_test",
        text: input.text,
        key: input.key,
        source: input.source ?? "user",
        created_at: Date.now(),
      } satisfies MemoryEntry),
    recall: () => Effect.succeed({ entries: [], query: "", count: 0 }),
    reflect: () => Effect.succeed({ summary: "", patterns: [], suggestions: [] }),
    clear: () => Effect.void,
    listKeys: () => Effect.succeed([]),
    count: () => Effect.succeed(0),
    forget: () => Effect.succeed(0),
    recallSession: () => Effect.succeed({ entries: [], query: "", count: 0 }),
    ...overrides,
  })
}

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_recall_test"),
  messageID: MessageID.make("msg_recall_test"),
  callID: "call_recall_test",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

function runRecall(
  memory: ReturnType<typeof makeMemory>,
  params: { query: string; limit?: number }, // kilocode_change
  context: Tool.Context = ctx,
) {
  const layer = Layer.mergeAll(
    Layer.succeed(Agent.Service, agents),
    Layer.succeed(Truncate.Service, truncate),
    Layer.succeed(CoreMemory, memory),
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* MemoryRecallTool
      const def = yield* resolved.init()
      return yield* def.execute(params, context)
    }).pipe(Effect.provide(layer)),
  )
}

describe("kappa_memory_recall (session memory)", () => {
  test("requires a query argument", () => {
    const decode = Schema.decodeUnknownSync(
      Schema.Struct({ query: Schema.String, limit: Schema.optional(Schema.Int) }),
    )
    expect(() => decode({})).toThrow()
    expect(() => decode({ query: "topic" })).not.toThrow()
    expect(() => decode({ query: "topic", limit: 10 })).not.toThrow()
  })

  test("recalls entries and renders them", async () => {
    const entries: MemoryEntry[] = [
      {
        id: "1",
        text: "Project uses bun for tests",
        key: "test-runner",
        source: "user",
        created_at: Date.now(),
        tags: ["tooling"],
      },
    ]
    const seen: { query: string; limit?: number }[] = []
    const memory = makeMemory({
      recall: (input) => {
        seen.push(input)
        return Effect.succeed({ entries, query: input.query, count: entries.length })
      },
    })
    const result = await runRecall(memory, { query: "test runner", limit: 5 })

    expect(seen).toEqual([{ query: "test runner", limit: 5 }])
    expect(result.title).toBe("memory_recall: 1 result")
    expect(result.output).toContain("Project uses bun for tests")
    expect(result.output).toContain("key=test-runner")
    expect(result.output).toContain("tags=[tooling]")
    expect(result.metadata.count).toBe(1)
  })

  test("renders empty results without crashing", async () => {
    const result = await runRecall(makeMemory(), { query: "nothing here" })
    expect(result.title).toBe("memory_recall: 0 results")
    expect(result.output).toContain("No memories matched query")
  })

  test("asks for permission before recalling", async () => {
    const asks: unknown[] = []
    const asking: Tool.Context = {
      ...ctx,
      ask: (req) => Effect.sync(() => { asks.push(req) }) as unknown as ReturnType<Tool.Context["ask"]>,
    }
    await runRecall(makeMemory(), { query: "topic" }, asking)
    expect(asks).toHaveLength(1)
    expect(asks[0]).toMatchObject({ permission: "kilo_memory_recall" })
  })

  test("maps permission denial to a denied result", async () => {
    const denied: Tool.Context = {
      ...ctx,
      ask: () => Effect.fail(new Error("permission denied by test")) as unknown as ReturnType<Tool.Context["ask"]>,
    }
    const result = await runRecall(makeMemory(), { query: "topic" }, denied)
    expect(result.title).toBe("memory_recall: permission denied")
    expect(result.metadata.count).toBe(0)
  })
})
