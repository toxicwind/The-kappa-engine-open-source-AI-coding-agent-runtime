// kilocode_change - new file — Phase 2: tool wrappers re-pointed to core memory service
import { Effect, Option, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { Service, type RecallResult } from "@opencode-ai/core/memory"

const memoryPermission = "kilo_memory_recall"

const RecallParams = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query — topic, keyword, or phrase to find in stored memories.",
  }),
  limit: Schema.optional(Schema.Int).annotate({ description: "Maximum memories to return (default: 5, max: 20)." }),
})

export const MemoryRecallTool = Tool.define(
  "kappa_memory_recall",
  Effect.gen(function* () {
    // Optional dependency: memory is an integrated capability, not a hard gate.
    // effect v4 serviceOption reads the service from context without adding it to
    // the required environment, so a runtime without Memory.node builds fine and
    // the tool degrades to a "memory not available" result instead of crashing.
    const memory = yield* Effect.serviceOption(Service)
    const render = (entries: RecallResult["entries"], query: string) => {
      if (entries.length === 0) return `No memories matched query: "${query}"`
      const lines = [`Found ${entries.length} memor${entries.length === 1 ? "y" : "ies"} for "${query}":`, ""]
      for (const entry of entries) {
        const keyTag = entry.key ? ` key=${entry.key}` : ""
        const tagTag = entry.tags?.length ? ` tags=[${entry.tags.join(",")}]` : ""
        const time = new Date(entry.created_at).toISOString().slice(0, 19)
        lines.push(`- [${entry.source}]${keyTag}${tagTag} (${time})`, `  ${entry.text.slice(0, 500)}`)
        if (entry.text.length > 500) lines.push(`  [truncated: ${entry.text.length} chars]`)
      }
      return lines.join("\n")
    }
    return {
      id: "kappa_memory_recall",
      description: [
        "Search kappa-code built-in memory for saved facts, decisions, and context.",
        "Returns matching memory entries ranked by relevance to the query.",
        "Memory is session-persistent: retains survive across turns and sessions within the same project.",
        "Use when the agent needs context from prior conversations, project decisions, or user corrections.",
      ].join("\n"),
      parameters: RecallParams,
      execute: (params: Schema.Schema.Type<typeof RecallParams>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (Option.isNone(memory)) {
            return {
              title: "memory_recall: unavailable",
              output: "Built-in memory is not enabled in this runtime. Nothing to recall.",
              metadata: { count: 0 },
            }
          }
          yield* ctx.ask({
            permission: memoryPermission,
            patterns: ["recall"],
            always: ["*"],
            metadata: { query: params.query, limit: params.limit },
          })
          const result = yield* memory.value.recall({ query: params.query, limit: params.limit })
          return {
            title: `memory_recall: ${result.count} result${result.count === 1 ? "" : "s"}`,
            output: render(result.entries, params.query),
            metadata: { count: result.count },
          }
        }).pipe(
          Effect.catchIf(
            (err: unknown) => err instanceof Error && err.message.startsWith("permission denied"),
            (err: { message: string }) =>
              Effect.succeed({
                title: "memory_recall: permission denied",
                output: `Permission denied for memory recall: ${err.message}`,
                metadata: { count: 0 },
              }),
          ),
        ),
      context: (ctx: Tool.Context) => ({ sessionID: ctx.sessionID, ask: ctx.ask }),
    }
  }),
)
