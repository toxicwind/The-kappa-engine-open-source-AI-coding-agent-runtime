export * as ConfigCommand from "./command.ts"

import path from "path"
import * as Log from "@opencode-ai/core/util/log"
import { Cause, Exit, Schema } from "effect"
import { SchemaIssue } from "effect" // kappacode_change - preserve Effect issue details in Kappa warnings
import { Glob } from "@opencode-ai/core/util/glob"
import { ConfigCommandV1 } from "@opencode-ai/core/v1/config/command"
import { configEntryNameFromPath } from "./entry-name.ts"
import * as ConfigMarkdown from "./markdown.ts"
// kappacode_change start
import { FrontmatterError } from "@opencode-ai/core/v1/config/error"
import { KappacodeConfig } from "@/kappacode/config/config"
import { report } from "@/kappacode/config/report"
import type { Warning } from "./config.ts"
import type { ConfigVariable } from "./variable.ts"
// kappacode_change end

const log = Log.create({ service: "config" })
const decodeInfo = Schema.decodeUnknownExit(ConfigCommandV1.Info)

// kappacode_change start
export async function load(
  dir: string,
  warnings?: Warning[],
  trusted = false,
  fileScope?: ConfigVariable.FileScope,
  sourceScope?: ConfigVariable.FileScope | readonly ConfigVariable.FileScope[],
) {
  // kappacode_change end
  const result: Record<string, ConfigCommandV1.Info> = {}
  for (const item of await Glob.scan("{command,commands}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    // kappacode_change start
    const md = await ConfigMarkdown.parse(item, { trusted, fileScope, sourceScope }).catch(async (err) => {
      // kappacode_change end
      const message = FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse command ${item}`
      // kappacode_change start
      if (warnings) warnings.push({ path: item, message })
      try {
        const { capture } = await import("@/kappacode/instance")
        const ctx = capture()
        if (ctx) await report(ctx, message)
      } catch (error) {
        log.warn("could not publish session error", { message, err: error })
      }
      // kappacode_change end
      log.error("failed to load command", { command: item, err })
      return undefined
    })
    if (!md) continue

    const name = configEntryNameFromPath(path.relative(dir, item), ["command/", "commands/"])

    const config = {
      name,
      ...md.data,
      template: md.content.trim(),
    }
    const parsed = decodeInfo(config, { errors: "all" }) // kilocode_change
    if (Exit.isSuccess(parsed)) {
      result[config.name] = parsed.value
      continue
    }
    // kappacode_change start
    const error = Cause.squash(parsed.cause)
    const issues = Schema.isSchemaError(error)
      ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map((issue) => ({
          ...issue,
          message: issue.message,
          path: issue.path?.map(String) ?? [],
        }))
      : [{ message: String(error), path: [] }]
    const cause = error instanceof Error ? error : new Error(String(error))
    await KappacodeConfig.handleInvalid("command", item, issues, cause, warnings)
    // kappacode_change end
  }
  return result
}
