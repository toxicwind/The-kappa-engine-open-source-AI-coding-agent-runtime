export * as MemoryReflectTool from "./memory-reflect"

import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Service, type ReflectResult, node as MemoryNode } from "../memory"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory_reflect"

const Description = [
  "Reflect on stored memories to identify patterns, generate insights, and surface suggestions.",
  "Runs a lightweight analysis over all stored memory entries to find recurring themes",
  "and provide actionable recommendations for the current session.",
].join("\n")

const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({
    description:
      "Optional focus query — reflect on memories related to this topic. If omitted, reflects on all memory.",
  }),
})

const OutputSchema = Schema.Struct({
  summary: Schema.String,
  output: Schema.String,
})

const render = (result: ReflectResult): string => {
  const lines = ["# Memory Reflection", "", result.summary, ""]
  if (result.patterns.length > 0) {
    lines.push("## Patterns", "")
    for (const p of result.patterns) lines.push(`- ${p}`)
    lines.push("")
  }
  if (result.suggestions.length > 0) {
    lines.push("## Suggestions", "")
    for (const s of result.suggestions) lines.push(`- ${s}`)
    lines.push("")
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
            const result: ReflectResult = yield* memory.reflect({ query: params.query })
            return {
              summary: result.summary,
              output: render(result),
            }
          }),
      }),
    })
  }).pipe(Effect.orDie),
)

export const node = makeLocationNode({
  name: "tool/memory_reflect",
  layer,
  deps: [ToolRegistry.node, MemoryNode],
})
