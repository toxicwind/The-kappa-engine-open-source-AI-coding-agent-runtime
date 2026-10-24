// kilocode_change - new file — Phase 2: tool wrappers re-pointed to core memory service
import { Effect, Option, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { Service, type MemoryEntry } from "@opencode-ai/core/memory"

const SaveParams = Schema.Struct({
  text: Schema.String.annotate({ description: "Memory text to save. Be concise and durable." }),
  key: Schema.optional(Schema.String).annotate({
    description: "Optional stable key for deduplication and targeted recall.",
  }),
  source: Schema.optional(Schema.Literals(["user", "auto", "tool"])).annotate({
    description: "Memory source (default: user).",
  }),
})

export const MemorySaveTool = Tool.define(
  "kappa_memory_save",
  Effect.gen(function* () {
    // Optional dependency: memory is an integrated capability, not a hard gate.
    // serviceOption reads it from context without adding it to the required
    // environment, so a runtime without Memory.node builds fine and this tool
    // degrades to a "memory not available" result instead of crashing.
    const memory = yield* Effect.serviceOption(Service)
    const render = (entry: MemoryEntry, key: string) => {
      const src = entry.source ?? "user"
      const keyLine = entry.key ? `\nsaved_key=${entry.key}` : ""
      return `Memory saved: ${entry.text.slice(0, 200)}${keyLine}\nsource=${src}`
    }
    return {
      id: "kappa_memory_save",
      description: [
        "Save a fact, decision, constraint, or correction into kappa-code built-in memory.",
        "Returns the saved entry with its key for future recall.",
        "Memory is project-scoped and persistent: entries survive agent restarts.",
        "Use a descriptive key when the entry is a repeatable concept.",
      ].join("\n"),
      parameters: SaveParams,
      execute: (params: Schema.Schema.Type<typeof SaveParams>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (Option.isNone(memory)) {
            return {
              title: "memory_save: unavailable",
              output: "Built-in memory is not enabled in this runtime. Nothing to save.",
              metadata: { count: 0, source: params.source ?? "user" },
            }
          }
          yield* ctx.ask({
            permission: "kilo_memory_save",
            patterns: ["save"],
            always: [],
            metadata: { text: params.text.slice(0, 200), key: params.key },
          })
          const entry = yield* memory.value.retain({
            text: params.text,
            key: params.key,
            source: params.source,
          })
          return {
            title: "memory_save: saved",
            output: render(entry, params.key ?? ""),
            metadata: { count: 1, source: entry.source },
          }
        }).pipe(
          Effect.catchIf(
            (err: unknown) => err instanceof Error && err.message.startsWith("permission denied"),
            () =>
              Effect.succeed({
                title: "memory_save: permission denied",
                output: "Permission denied for memory save.",
                metadata: { count: 0 },
              }),
          ),
        ),
      context: (ctx: Tool.Context) => ({ sessionID: ctx.sessionID, ask: ctx.ask }),
    }
  }),
)
