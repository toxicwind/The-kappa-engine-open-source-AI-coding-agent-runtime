import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { KappaCli } from "../../../../src/kappacode/cli/setup"
import { createHelpCommand } from "../../../../src/kappacode/help-command"
import { resetLazyCommandSelection } from "../../../../src/kappacode/cli/lazy-commands"
import yargs from "yargs"

describe("CLI bootstrap runtime selection", () => {
  beforeEach(resetLazyCommandSelection)
  afterEach(resetLazyCommandSelection)

  test("uses the narrow runtime for worker-backed TUI launches", () => {
    expect(KappaCli.workerTui({ _: [] })).toBe(true)
    expect(KappaCli.workerTui({ _: ["./project"] })).toBe(true)
  })

  test("keeps full bootstrap for explicit, mini, and worktree commands", () => {
    expect(KappaCli.workerTui({ _: [], mini: true })).toBe(false)
    expect(KappaCli.workerTui({ _: [], worktree: "feature" })).toBe(false)
  })

  test("keeps full bootstrap when the eager help command is selected", () => {
    const command = createHelpCommand()
    if (typeof command.builder !== "function") throw new Error("help builder is not a function")
    command.builder(yargs([]))
    expect(KappaCli.workerTui({ _: [] })).toBe(false)
  })
})
