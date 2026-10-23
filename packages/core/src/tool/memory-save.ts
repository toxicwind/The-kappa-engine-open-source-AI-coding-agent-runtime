export * as MemorySaveTool from "./memory-save"

import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { ToolRegistry } from "./registry"
import { Service, type MemoryEntry, node as MemoryNode } from "../memory"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "memory_save"

const Description = [
  "Save a fact, decision, constraint, or correction into kappa-code built-in memory.",
  "Returns the saved entry with its key for future recall.",
  "Memory is project-scoped and persistent: entries survive agent restarts.",
  "Use a descriptive key when the entry is a repeatable concept (e.g. 'architecture_decision', 'project_constraint').",
].join("\n")

const Parameters = Schema.Struct({
  text: Schema.String.annotate({
    description: "Memory text to save. Be concise and durable — this is long-lived context.",
  }),
  key: Schema.optional(Schema.String).annotate({
    description: "Optional stable key for deduplication and targeted recall. Use when saving repeatable concepts.",
  }),
  source: Schema.optional(Schema.Literals(["user", "auto", "tool"])).annotate({
    description: "Memory source (default: user). 'tool' is for agent-initiated retention.",
  }),
})

const OutputSchema = Schema.Struct({
  key: Schema.String,
  source: Schema.String,
  count: Schema.Number,
  output: Schema.String,
})

const render = (entry: MemoryEntry, key: string): string => {
  const src = entry.source ?? "user"
  const keyLine = entry.key ? `\nsaved_key=${entry.key}` : ""
  return `Memory saved: ${entry.text.slice(0, 200)}${keyLine}\nsource=${src}`
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
            const entry: MemoryEntry = yield* memory.retain({
              text: params.text,
              key: params.key,
              source: params.source,
            })
            return {
              key: entry.key ?? entry.id,
              source: entry.source,
              count: 1,
              output: render(entry, params.key ?? ""),
            }
          }),
      }),
    })
  }).pipe(Effect.orDie),
)

export const node = makeLocationNode({
  name: "tool/memory_save",
  layer,
  deps: [ToolRegistry.node, MemoryNode],
})
