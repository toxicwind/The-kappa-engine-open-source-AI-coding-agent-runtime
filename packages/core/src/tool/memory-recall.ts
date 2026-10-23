export * as MemoryRecallTool from "./memory-recall"

import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Service, type MemoryEntry, type RecallResult, node as MemoryNode } from "../memory"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory_recall"

const Description = [
  "Search kappa-code built-in memory for saved facts, decisions, and context.",
  "Returns matching memory entries ranked by relevance to the query.",
  "Memory is session-persistent: retains survive across turns and sessions within the same project.",
  "Use when the agent needs context from prior conversations, project decisions, or user corrections.",
].join("\n")

const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query — topic, keyword, or phrase to find in stored memories.",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum memories to return (default: 5, max: 20).",
  }),
})

const OutputSchema = Schema.Struct({
  count: Schema.Number,
  output: Schema.String,
})

const render = (entries: MemoryEntry[], query: string): string => {
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

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const memory = yield* Service

    yield* tools.register({
      [name]: Tool.make({
        description: Description,
        input: Parameters,
        output: OutputSchema,
        toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
        execute: (params) =>
          Effect.gen(function* () {
            const result: RecallResult = yield* memory.recall({ query: params.query, limit: params.limit })
            return {
              count: result.count,
              output: render(result.entries, params.query),
            }
          }),
      }),
    })
  }).pipe(Effect.orDie),
)

export const node = makeLocationNode({
  name: "tool/memory_recall",
  layer,
  deps: [ToolRegistry.node, MemoryNode],
})
