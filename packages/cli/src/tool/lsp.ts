import { Effect, Schema } from "effect" // kilocode_change
import * as Tool from "./tool.ts"
import path from "path"
import { LSP } from "@/lsp/lsp"
import DESCRIPTION from "./lsp.txt"
import { InstanceState } from "@/effect/instance-state"
import { pathToFileURL } from "url"
import { assertExternalDirectoryEffect } from "./external-directory.ts"
import { FSUtil } from "@opencode-ai/core/fs-util"

// kilocode_change - LSP diagnostics operation (D2)

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
  "diagnostics", // kilocode_change
] as const

export const Parameters = Schema.Struct({
  operation: Schema.Literals(operations).annotate({ description: "The LSP operation to perform" }),
  filePath: Schema.optional(Schema.String).annotate({ description: "The absolute or relative path to the file" }), // kilocode_change
  line: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).annotate({ // kilocode_change
    // kilocode_change
    // kilocode_change
    description: "The line number (1-based, as shown in editors)",
  }),
  character: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).annotate({ // kilocode_change
    // kilocode_change
    // kilocode_change
    description: "The character offset (1-based, as shown in editors)",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query for workspaceSymbol. Empty string requests all symbols.",
  }),
})

export const LspTool = Tool.define(
  "lsp",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)
          yield* assertExternalDirectoryEffect(ctx, file)
          const meta =
            args.operation === "workspaceSymbol"
              ? { operation: args.operation }
              : args.operation === "documentSymbol"
                ? { operation: args.operation, filePath: file }
                : { operation: args.operation, filePath: file, line: args.line, character: args.character }
          yield* ctx.ask({
            permission: "lsp",
            patterns: ["*"],
            always: ["*"],
            metadata: meta,
          })

          const uri = pathToFileURL(file).href
          // kilocode_change start
          const position = {
            file,
            line: args.line ? args.line - 1 : 0,
            character: args.character ? args.character - 1 : 0,
          }
          const relPath = path.relative(instance.worktree, file)
          const detail =
            args.operation === "workspaceSymbol"
              ? ""
              : args.operation === "documentSymbol"
                ? relPath
                : args.operation === "diagnostics"
                  ? relPath
                  : `${relPath}:${args.line}:${args.character}`
          const title = detail ? `${args.operation} ${detail}` : args.operation

          const exists = yield* fs.existsSafe(file)
          if (!exists) throw new Error(`File not found: ${file}`)

          const available = yield* lsp.hasClients(file)
          if (!available) throw new Error("No LSP server available for this file type.")

          yield* lsp.touchFile(file, "document")

          const opsResult: unknown = yield* (() => {
            switch (args.operation) {
              case "goToDefinition":
                return lsp.definition(position)
              case "findReferences":
                return lsp.references(position)
              case "hover":
                return lsp.hover(position)
              case "documentSymbol":
                return lsp.documentSymbol(uri)
              case "workspaceSymbol":
                return lsp.workspaceSymbol(args.query ?? "")
              case "goToImplementation":
                return lsp.implementation(position)
              case "prepareCallHierarchy":
                return lsp.prepareCallHierarchy(position)
              case "incomingCalls":
                return lsp.incomingCalls(position)
              case "outgoingCalls":
                return lsp.outgoingCalls(position)
              case "diagnostics":
                return lsp.diagnostics()
            }
          })()

          const ops: unknown[] = args.operation === "diagnostics" ? [opsResult] : (opsResult as unknown[])

          const opMeta: Record<string, unknown> =
            args.operation === "diagnostics"
              ? { diagnostics: opsResult }
              : args.operation === "workspaceSymbol"
                ? { operation: args.operation }
                : args.operation === "documentSymbol"
                  ? { operation: args.operation, filePath: file }
                  : { operation: args.operation, filePath: file, line: args.line, character: args.character }

          return {
            title,
            metadata: opMeta,
            output:
              args.operation === "diagnostics"
                ? Object.keys(opsResult as Record<string, unknown> | {}).length === 0
                  ? "No diagnostics found"
                  : JSON.stringify(opsResult, null, 2)
                : ops.length === 0
                  ? `No results found for ${args.operation}`
                  : JSON.stringify(ops, null, 2),
          }
          // kilocode_change end
        }).pipe(Effect.orDie),
    }
  }),
)
