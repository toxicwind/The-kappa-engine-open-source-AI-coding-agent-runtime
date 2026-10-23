import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import * as Tool from "@/tool/tool"
import { MemoryRecallTool } from "@/kappacode/tool/memory-recall"
import { MemorySaveTool } from "@/kappacode/tool/memory-save"

function makeCtx(sessionID: string) {
  return {
    sessionID,
    ask: (req: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }) =>
      Effect.sync(() => undefined),
  } as unknown as Tool.ExecuteContext
}

describe("MemoryRecallTool unavailable path", () => {
  test("returns unavailable when Service is not in context", () =>
    Effect.gen(function* () {
      const info = yield* MemoryRecallTool.pipe(Effect.provide(Layer.empty))
      const result = yield* info.execute({ query: "topic" }, makeCtx("ses_recall_unavail"))
      expect(result.title).toBe("memory_recall: unavailable")
      expect(result.output).toContain("not enabled")
      expect(result.metadata.count).toBe(0)
    }).pipe(Effect.runPromise))

  test("withPermit release after effect error path", () =>
    Effect.gen(function* () {
      const info = yield* MemoryRecallTool.pipe(Effect.provide(Layer.empty))
      const result = yield* info.execute({ query: "" }, makeCtx("ses_recall_empty"))
      expect(result.output).toContain("not enabled")
    }).pipe(Effect.runPromise))
})

describe("MemorySaveTool unavailable path", () => {
  test("returns unavailable when Service is not in context", () =>
    Effect.gen(function* () {
      const info = yield* MemorySaveTool.pipe(Effect.provide(Layer.empty))
      const result = yield* info.execute({ text: "test memory" }, makeCtx("ses_save_unavail"))
      expect(result.title).toBe("memory_save: unavailable")
      expect(result.output).toContain("not enabled")
      expect(result.metadata.count).toBe(0)
    }).pipe(Effect.runPromise))
})
