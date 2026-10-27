import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { DatabaseMigration } from "@opencode-ai/core/database/migration"
import { migrations } from "@opencode-ai/core/database/migration.gen"
import boardMigration from "@opencode-ai/core/database/migration/20260828074139_kappacode_board"
import reset from "@opencode-ai/core/database/migration/20260903104806_kappacode_board_reset"
import type { SqlClient as SqlClientService } from "effect/sql/SqlClient"
import { line } from "../../../script/kappacode/migration"

const make = EffectDrizzleSqlite.makeWithDefaults()

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

describe("board migration", () => {
  test("preserves reset migration annotations during registry generation", () => {
    const source = 'import("./migration")'
    expect(line(reset.id, source)).toBe(`${source} // kappacode_change`)
    expect(line("upstream_migration", source)).toBe(source)
  })

  test("adds a zero reset floor without changing existing history or identities", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* make
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
        yield* db.run(sql`INSERT INTO session (id) VALUES ('ses_root')`)
        yield* DatabaseMigration.applyOnly(db, [boardMigration])
        yield* db.run(sql`INSERT INTO kappa_board (root_session_id, objective, next_seq, message_count, message_bytes, time_created, time_updated)
        VALUES ('ses_root', 'Existing objective', 2, 1, 100, 1, 1)`)
        yield* db.run(sql`INSERT INTO kappa_board_message (id, board_root_session_id, seq, time_created, sender_session_id, recipient, type, body, source_message_id, source_call_id)
        VALUES ('board_existing', 'ses_root', 1, 1, 'ses_root', 'ALL', 'INFO', 'Existing message', 'msg_existing', 'call_existing')`)
        yield* DatabaseMigration.applyOnly(db, [reset])
        expect(
          yield* db.get(sql`SELECT cleared_seq, next_seq, message_count, message_bytes, objective FROM kappa_board`),
        ).toEqual({
          cleared_seq: 0,
          next_seq: 2,
          message_count: 1,
          message_bytes: 100,
          objective: "Existing objective",
        })
        expect(yield* db.get(sql`SELECT id, seq, body, source_call_id FROM kappa_board_message`)).toEqual({
          id: "board_existing",
          seq: 1,
          body: "Existing message",
          source_call_id: "call_existing",
        })
      }),
    )
  })

  test("creates board tables and cascades only from the root", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* make
        yield* DatabaseMigration.apply(db)
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kappa_board'`)).toEqual(
          {
            name: "kappa_board",
          },
        )
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kappa_board_message'`),
        ).toEqual({ name: "kappa_board_message" })
        expect(yield* db.all(sql`PRAGMA foreign_key_list('kappa_board_message')`)).toMatchObject([
          { table: "kappa_board", on_delete: "CASCADE" },
        ])
        expect(yield* db.all(sql`PRAGMA foreign_key_list('kappa_board')`)).toMatchObject([
          { table: "session", on_delete: "CASCADE" },
        ])
        expect(migrations.find((migration) => migration.id.includes("kappacode_board"))?.id).toContain("kappacode_board")
      }),
    )
  })

  test("adds board tables to an existing session database", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* make
        yield* db.run(sql`CREATE TABLE project (id text PRIMARY KEY)`)
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, project_id text)`)
        yield* db.run(sql`INSERT INTO project (id) VALUES ('project')`)
        yield* db.run(sql`INSERT INTO session (id, project_id) VALUES ('session', 'project')`)
        yield* DatabaseMigration.applyOnly(db, [boardMigration])
        expect(
          yield* db.get(sql`SELECT root_session_id FROM kappa_board WHERE root_session_id = 'session'`),
        ).toBeUndefined()
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE name = 'kappa_board_message'`)).toEqual({
          name: "kappa_board_message",
        })
      }),
    )
  })
})
