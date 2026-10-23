// kilocode_change - new file — Phase 2: tool wrappers re-pointed to core memory service
import { Effect } from "effect"
import * as Tool from "@/tool/tool"
import { Service } from "@opencode-ai/core/memory"

export const MemorySaveTool = Tool.define(
  "kappa_memory_save",
  Effect.gen(function* () {
    const memory = yield* Service
    const render = (entry, key) => {
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
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Memory text to save. Be concise and durable." },
          key: { type: "string", description: "Optional stable key for deduplication and targeted recall." },
          source: { type: "string", enum: ["user", "auto", "tool"], description: "Memory source (default: user)." },
        },
        required: ["text"],
      },
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "kilo_memory_save",
            patterns: ["save"],
            always: [],
            metadata: { text: params.text.slice(0, 200), key: params.key },
          })
          const entry = yield* memory.retain({
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
            (err) => err instanceof Error && err.message.startsWith("permission denied"),
            () =>
              Effect.succeed({
                title: "memory_save: permission denied",
                output: "Permission denied for memory save.",
                metadata: { count: 0 },
              }),
          ),
        ),
      context: (ctx) => ({ sessionID: ctx.sessionID, ask: ctx.ask }),
    }
  }),
)
