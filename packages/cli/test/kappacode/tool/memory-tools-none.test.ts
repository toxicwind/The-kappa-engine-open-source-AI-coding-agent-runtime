import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import type { Tool } from "@/tool/tool"
import * as Truncate from "@/tool/truncate"
import { MemoryRecallTool } from "@/kappacode/tool/memory-recall"
import { MemorySaveTool } from "@/kappacode/tool/memory-save"
import { MessageID, SessionID } from "@/session/schema"

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

// Memory service deliberately absent: the tools' Effect.serviceOption degrades
// to the "unavailable" result instead of crashing.
const layer = Layer.mergeAll(
  Layer.succeed(Agent.Service, agents),
  Layer.succeed(Truncate.Service, truncate),
)

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_none_test"),
  messageID: MessageID.make("msg_none_test"),
  callID: "call_none_test",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

function runNone(
  tool: Effect.Effect<Tool.Info, never, Agent.Service | Truncate.Service>,
  params: unknown,
) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* tool
      const def = yield* resolved.init()
      return yield* def.execute(params, ctx)
    }).pipe(Effect.provide(layer)),
  )
}

describe("MemoryRecallTool unavailable path", () => {
  test("returns unavailable when Service is not in context", async () => {
    const result = await runNone(MemoryRecallTool, { query: "topic" })
    expect(result.title).toBe("memory_recall: unavailable")
    expect(result.output).toContain("not enabled")
    expect(result.metadata.count).toBe(0)
  })

  test("withPermit release after effect error path", async () => {
    const result = await runNone(MemoryRecallTool, { query: "" })
    expect(result.output).toContain("not enabled")
  })
})

describe("MemorySaveTool unavailable path", () => {
  test("returns unavailable when Service is not in context", async () => {
    const result = await runNone(MemorySaveTool, { text: "test memory" })
    expect(result.title).toBe("memory_save: unavailable")
    expect(result.output).toContain("not enabled")
    expect(result.metadata.count).toBe(0)
  })
})
