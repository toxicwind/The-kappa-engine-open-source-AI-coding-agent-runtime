import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260903104806_kappacode_board_reset",
  up(tx) {
    return Effect.gen(function* () {
      // kappacode_change start - guard the ADD COLUMN: this migration was renamed
      // kilocode_board_reset -> kappacode_board_reset, so a fresh build may replay it
      // against a DB that already has the column from the kilocode-era run.
      const hasClearedSeq = yield* tx.get<{ name: string }>(
        `SELECT name FROM pragma_table_info('kappa_board') WHERE name = 'cleared_seq';`,
      )
      if (!hasClearedSeq) {
        yield* tx.run(`ALTER TABLE \`kappa_board\` ADD \`cleared_seq\` integer DEFAULT 0 NOT NULL;`)
      }
      // kappacode_change end
    })
  },
} satisfies DatabaseMigration.Migration
