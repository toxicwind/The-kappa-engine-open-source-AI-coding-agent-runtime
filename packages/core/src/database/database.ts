export * as Database from "./database"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { existsSync } from "fs" // kappacode_change
import { DbPreflight } from "../kappacode/db-preflight" // kappacode_change
import { ensure as compat } from "../kappacode/database-compat" // kappacode_change
import { DatabaseMigration } from "./migration"
import { InstallationChannel, safeChannelToken } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    // kappacode_change start - install SQLite's busy handler before concurrent processes can race to recover the WAL
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA journal_mode = WAL")
    // kappacode_change end
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)
    yield* compat(db) // kappacode_change - keep the shared database usable by released CLIs

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  DbPreflight.assertWritable(filename) // kappacode_change - actionable error (and self-heal for kappa-owned files) instead of an opaque wal_checkpoint crash on read-only db files
  return layer.pipe(Layer.provide(sqliteLayer({ filename, disableWAL: true }))) // kappacode_change - Database configures WAL after busy_timeout
}

export function path() {
  if (Flag.KAPPA_DB) {
    if (Flag.KAPPA_DB === ":memory:" || isAbsolute(Flag.KAPPA_DB)) return Flag.KAPPA_DB
    return join(Global.Path.data, Flag.KAPPA_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.KAPPA_DISABLE_CHANNEL_DB === "1" ||
    process.env.KAPPA_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "kappa.db")
  // kappacode_change start - kappa-branded dev-channel db name, falling back to a pre-existing opencode-named db
  const safe = safeChannelToken(InstallationChannel) // kappacode_change
  const next = join(Global.Path.data, `kappa-${safe}.db`)
  const prev = join(Global.Path.data, `opencode-${safe}.db`)
  if (!existsSync(next) && existsSync(prev)) return prev
  return next
  // kappacode_change end
}

// kappacode_change - resolve the database path when the layer builds, not at module evaluation, so KAPPA_DB overrides set after import (tests, embedded hosts) take effect
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.unwrap(Effect.sync(() => layerFromPath(path()))),
  deps: [],
})
