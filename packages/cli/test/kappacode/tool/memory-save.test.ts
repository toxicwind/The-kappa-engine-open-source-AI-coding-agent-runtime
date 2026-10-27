import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Agent } from "@/agent/agent"
import type { Tool } from "@/tool/tool"
import * as Truncate from "@/tool/truncate"
import { MemorySaveTool } from "@/kappacode/tool/memory-save"
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
  sessionID: SessionID.make("ses_save_test"),
  messageID: MessageID.make("msg_save_test"),
  callID: "call_save_test",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

function runSave(
  memory: ReturnType<typeof makeMemory>,
  params: { readonly text: string; readonly key?: string; readonly source?: "auto" | "tool" | "user" },
  context: Tool.Context = ctx,
) {
  const layer = Layer.mergeAll(
    Layer.succeed(Agent.Service, agents),
    Layer.succeed(Truncate.Service, truncate),
    Layer.succeed(CoreMemory, memory),
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* MemorySaveTool
      const def = yield* resolved.init()
      return yield* def.execute(params, context)
    }).pipe(Effect.provide(layer)),
  )
}

describe("kappa_memory_save (session memory)", () => {
  test("requires text and accepts optional key/source", () => {
    const decode = Schema.decodeUnknownSync(
      Schema.Struct({
        text: Schema.String,
        key: Schema.optional(Schema.String),
        source: Schema.optional(Schema.Literals(["user", "auto", "tool"])),
      }),
    )
    expect(() => decode({})).toThrow()
    expect(() => decode({ text: "fact" })).not.toThrow()
    expect(() => decode({ text: "fact", key: "k", source: "tool" })).not.toThrow()
  })

  test("saves an entry and renders it", async () => {
    const seen: unknown[] = []
    const memory = makeMemory({
      retain: (input) => {
        seen.push(input)
        return Effect.succeed({
          id: "saved-1",
          text: input.text,
          key: input.key,
          source: input.source ?? "user",
          created_at: Date.now(),
        } satisfies MemoryEntry)
      },
    })
    const result = await runSave(memory, { text: "Remember the build command", key: "build-cmd", source: "user" })

    expect(seen).toEqual([{ text: "Remember the build command", key: "build-cmd", source: "user" }])
    expect(result.title).toBe("memory_save: saved")
    expect(result.output).toContain("Remember the build command")
    expect(result.output).toContain("saved_key=build-cmd")
    expect(result.metadata.count).toBe(1)
  })

  test("asks for permission before saving", async () => {
    const asks: unknown[] = []
    const asking: Tool.Context = {
      ...ctx,
      ask: (req) => Effect.sync(() => { asks.push(req) }) as unknown as ReturnType<Tool.Context["ask"]>,
    }
    await runSave(makeMemory(), { text: "fact" }, asking)
    expect(asks).toHaveLength(1)
    expect(asks[0]).toMatchObject({ permission: "kilo_memory_save" })
  })

  test("maps permission denial to a denied result", async () => {
    const denied: Tool.Context = {
      ...ctx,
      ask: () => Effect.fail(new Error("permission denied by test")) as unknown as ReturnType<Tool.Context["ask"]>,
    }
    const result = await runSave(makeMemory(), { text: "fact" }, denied)
    expect(result.title).toBe("memory_save: permission denied")
    expect(result.metadata.count).toBe(0)
  })
})
