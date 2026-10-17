import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import * as KappaGrep from "@/kappacode/tool/grep-signal-controls" // kappacode_change
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "Pattern to search for in file contents (regex by default)" }), // kappacode_change
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
  ...KappaGrep.fields, // kappacode_change
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: KappaGrep.describe(DESCRIPTION), // kappacode_change
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const limit = params.limit ?? KappaGrep.DEFAULT_LIMIT // kappacode_change
          const context = params.context ?? 0 // kappacode_change
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false },
            output: "No files found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: params.include,
              ...KappaGrep.metadata(params, limit, context), // kappacode_change
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = FSUtil.resolve(requested)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!info || (info.type !== "File" && info.type !== "Directory")) return empty // kappacode_change
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          const result = yield* ripgrep.grep({
            cwd,
            file: info?.type === "File" ? path.basename(search) : undefined, // kappacode_change - constrain exact-file searches
            pattern: params.pattern,
            include: params.include,
            ...KappaGrep.options(params, limit, context), // kappacode_change
            signal: ctx.abort, // kappacode_change - stop ripgrep when the tool call is cancelled
          })
          // kappacode_change start
          const matches = result.items
          if (matches.length === 0) return empty
          // kappacode_change end

          const rows = matches.map((item) => ({
            // kappacode_change
            path: path.resolve(
              requestedInfo?.type === "Directory" ? requested : path.dirname(requested),
              item.entry.path,
            ),
            line: item.line,
            text: item.text,
            context: item.context, // kappacode_change
            textTruncated: item.textTruncated, // kappacode_change
          }))

          const truncated = result.truncated // kappacode_change
          const final = rows
          if (final.length === 0) return empty

          const total = rows.filter((row) => !row.context).length // kappacode_change
          const hasMore = truncated // kappacode_change
          const output = [`Found ${total} matches${hasMore ? " (more matches available)" : ""}`]

          let current = ""
          for (const match of final) {
            if (current !== match.path) {
              if (current !== "") output.push("")
              current = match.path
              output.push(`${match.path}:`)
            }
            output.push(KappaGrep.line(match, context)) // kappacode_change
          }

          if (truncated) {
            output.push("")
            output.push(KappaGrep.limitNotice(limit)) // kappacode_change
          }
          output.push(...KappaGrep.notices(rows)) // kappacode_change
          if (result.partial) output.push("", "(Some paths were inaccessible.)") // kappacode_change

          return {
            title: params.pattern,
            metadata: {
              matches: total,
              truncated,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
