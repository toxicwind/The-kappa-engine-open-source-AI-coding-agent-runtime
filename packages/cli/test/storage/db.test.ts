import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { InstallationChannel, safeChannelToken } from "@opencode-ai/core/installation/version" // kappacode_change
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Database } from "@/storage/db"
import { it } from "../lib/effect.ts"

describe("Database.getChannelPath", () => {
  it.effect("returns database path for the current channel", () =>
    Effect.gen(function* () {
      const flags = yield* RuntimeFlags.Service
      const expected = ["latest", "beta", "prod"].includes(InstallationChannel)
        ? path.join(Global.Path.data, "kappa.db")
        : path.join(Global.Path.data, `kappa-${safeChannelToken(InstallationChannel)}.db`) // kappacode_change

      expect(Database.getChannelPath(flags)).toBe(expected)
    }).pipe(Effect.provide(RuntimeFlags.layer())),
  )

  it.effect("uses the shared database path when channel databases are disabled", () =>
    Effect.gen(function* () {
      const flags = yield* RuntimeFlags.Service

      expect(Database.getChannelPath(flags)).toBe(path.join(Global.Path.data, "kappa.db"))
    }).pipe(Effect.provide(RuntimeFlags.layer({ disableChannelDb: true }))),
  )

  it.effect("accepts RuntimeFlags with skipMigrations for database callers", () =>
    Effect.gen(function* () {
      const flags = yield* RuntimeFlags.Service

      expect(flags.skipMigrations).toBe(true)
      expect(Database.getChannelPath(flags)).toBe(Database.getChannelPath({ disableChannelDb: flags.disableChannelDb }))
    }).pipe(Effect.provide(RuntimeFlags.layer({ skipMigrations: true }))),
  )
})

describe("safeChannelToken", () => {
  // kappacode_change start — regression: a dev/local build from a detached HEAD (or
  // branch-less git context) resolves the channel to "" and would otherwise produce
  // a `kappa-.db` that silently forks the session database away from `kappa-main.db`.
  test("falls back to a stable token for an empty channel", () => {
    expect(safeChannelToken("")).toBe("dev")
    expect(safeChannelToken("!!&&##")).toBe("dev")
  })

  test("preserves a valid non-empty channel", () => {
    expect(safeChannelToken("main")).toBe("main")
    expect(safeChannelToken("rc")).toBe("rc")
    expect(safeChannelToken("feature/foo bar")).toBe("feature-foo-bar")
  })

  test("never returns a token that yields a trailing-dot db name", () => {
    expect(path.join(Global.Path.data, `kappa-${safeChannelToken("")}.db`)).toBe(
      path.join(Global.Path.data, "kappa-dev.db"),
    )
  })
  // kappacode_change end
})
