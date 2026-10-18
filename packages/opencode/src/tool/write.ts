import { Schema } from "effect"
import * as path from "path"
import { Effect } from "effect"
import * as Tool from "./tool.ts"
import { LSP } from "@/lsp/lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { Format } from "../format/index.ts"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { trimDiff, buildFileDiff } from "./edit.ts" // kappacode_change
import { assertExternalDirectoryEffect } from "./external-directory.ts"
import { filterDiagnostics } from "./diagnostics.ts" // kappacode_change
import { ConfigValidation } from "../kappacode/config-validation.ts" // kappacode_change
import * as EncodedIO from "../kappacode/tool/encoded-io.ts" // kappacode_change
import { assertMutablePath } from "../kappacode/agent-manager/protection.ts" // kappacode_change
import * as Bom from "@/util/bom"

const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({ description: "The content to write to the file" }),
  filePath: Schema.String.annotate({
    description: "The absolute path to the file to write (must be absolute, not relative)",
  }),
})

export const WriteTool = Tool.define(
  "write",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const format = yield* Format.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const filepath = path.isAbsolute(params.filePath)
            ? params.filePath
            : path.join(instance.directory, params.filePath)
          assertMutablePath(filepath) // kappacode_change
          yield* assertExternalDirectoryEffect(ctx, filepath)

          const exists = yield* fs.existsSafe(filepath)
          // kappacode_change start - encoding-aware read; Encoding.read strips UTF-8 BOMs so
          // derive the BOM flag from the detected encoding label instead of the decoded text.
          const pre = exists ? yield* EncodedIO.read(fs, filepath) : { text: "", encoding: "utf-8" }
          const source = { bom: pre.encoding === "utf-8-bom", text: pre.text, encoding: pre.encoding }
          // kappacode_change end
          const next = Bom.split(params.content)
          const desiredBom = source.bom || next.bom
          const contentOld = source.text
          const contentNew = next.text

          const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
          const filediff = buildFileDiff(filepath, contentOld, contentNew) // kappacode_change
          yield* ctx.ask({
            permission: "edit",
            patterns: [path.relative(instance.worktree, filepath)],
            always: ["*"],
            metadata: {
              filepath,
              diff,
              filediff, // kappacode_change
            },
          })

          yield* EncodedIO.write(fs, filepath, Bom.join(contentNew, desiredBom), source.encoding) // kappacode_change - encoding-aware write (mkdirs) replaces fs.writeWithDirs
          if (yield* format.file(filepath)) {
            yield* EncodedIO.sync(fs, filepath, desiredBom, source.encoding)
          }
          yield* events.publish(FileSystem.Event.Edited, { file: filepath })
          yield* events.publish(Watcher.Event.Updated, {
            file: filepath,
            event: exists ? "change" : "add",
          })

          let output = "Wrote file successfully."
          yield* lsp.touchFile(filepath, "document")
          const diagnostics = yield* lsp.diagnostics()
          const normalizedFilepath = FSUtil.normalizePath(filepath)
          let projectDiagnosticsCount = 0
          for (const [file, issues] of Object.entries(diagnostics)) {
            const current = file === normalizedFilepath
            if (!current && projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
            const block = LSP.Diagnostic.report(current ? filepath : file, issues)
            if (!block) continue
            if (current) {
              output += `\n\nLSP errors detected in this file, please fix:\n${block}`
              continue
            }
            projectDiagnosticsCount++
            output += `\n\nLSP errors detected in other files:\n${block}`
          }
          output += yield* Effect.promise(() => ConfigValidation.check(filepath)) // kappacode_change

          return {
            title: path.relative(instance.worktree, filepath),
            metadata: {
              diagnostics: filterDiagnostics(diagnostics, [normalizedFilepath]), // kappacode_change
              filepath,
              exists: exists,
              diff, // kappacode_change
              filediff, // kappacode_change
            },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
