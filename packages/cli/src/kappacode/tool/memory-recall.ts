// kilocode_change - new file — Phase 2: tool wrappers re-pointed to core memory service
import { Effect, Layer } from "effect"
import { Instance } from "@/kappacode/instance"
import * as Tool from "@/tool/tool"
import { Service, node as MemoryNode } from "@opencode-ai/core/memory"
import { Permission } from "@/permission"

const memoryPermission = "kilo_memory_recall"
const savePermission = "kilo_memory_save"

export const MemoryRecallTool = Tool.define(
  "kappa_memory_recall",
  Effect.gen(function* () {
    const memory = yield* Service
    const render = (entries, query) => {
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
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — topic, keyword, or phrase to find in stored memories.",
          },
          limit: { type: "number", description: "Maximum memories to return (default: 5, max: 20)." },
        },
        required: ["query"],
      },
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: memoryPermission,
            patterns: ["recall"],
            always: ["*"],
            metadata: { query: params.query, limit: params.limit },
          })
          const result = yield* memory.recall({ query: params.query, limit: params.limit })
          return {
            title: `memory_recall: ${result.count} result${result.count === 1 ? "" : "s"}`,
            output: render(result.entries, params.query),
            metadata: { count: result.count },
          }
        }).pipe(
          Effect.catchIf(
            (err) => err instanceof Error && err.message.startsWith("permission denied"),
            (err) =>
              Effect.succeed({
                title: "memory_recall: permission denied",
                output: `Permission denied for memory recall: ${err.message}`,
                metadata: { count: 0 },
              }),
          ),
        ),
      context: (ctx) => ({ sessionID: ctx.sessionID, ask: ctx.ask }),
    }
  }),
)

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
        "Use a descriptive key when the entry is a repeatable concept (e.g. 'architecture_decision', 'project_constraint').",
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
            permission: savePermission,
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
            (err) =>
              Effect.succeed({
                title: "memory_save: permission denied",
                output: `Permission denied for memory save: ${err.message}`,
                metadata: { count: 0 },
              }),
          ),
        ),
      context: (ctx) => ({ sessionID: ctx.sessionID, ask: ctx.ask }),
    }
  }),
)
