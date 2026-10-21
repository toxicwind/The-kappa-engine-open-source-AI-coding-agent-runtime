import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260903104806_kappacode_board_reset",
  up(tx) {
    return Effect.gen(function* () {
      // kappacode_change start
      yield* tx.run(`ALTER TABLE \`kappa_board\` ADD \`cleared_seq\` integer DEFAULT 0 NOT NULL;`)
      // kappacode_change end
    })
  },
} satisfies DatabaseMigration.Migration
