import { expect, test } from "bun:test"
import { internalTuiPlugins } from "@/plugin/tui/internal"

const kappa = [
  "internal:home-news",
  "internal:home-onboarding",
  "internal:kappa-attention",
  "internal:kappa-home-footer",
  "internal:kappa-permissions",
  "internal:kappa-sidebar-footer",
  "internal:kappa-sidebar-memory",
  "internal:kappa-memory-palette",
  "internal:kappa-sidebar-background-processes",
  "internal:kappa-sidebar-indexing",
  "internal:kappa-sidebar-pr",
  "internal:kappa-sidebar-usage",
  "internal:sandbox",
  "internal:remote",
  "internal:reload",
]

test("internal TUI registry preserves every Kilo plugin before upstream builtins", () => {
  const ids = internalTuiPlugins({ experimentalEventSystem: false, experimentalSessionSwitcher: false }).map(
    (plugin) => plugin.id,
  )

  expect(ids.slice(0, kappa.length)).toEqual(kappa)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toContain("internal:sidebar-context")
  expect(ids).toContain("diff-viewer")
})

test("experimental Kilo TUI plugins remain wired", () => {
  const ids = internalTuiPlugins({ experimentalEventSystem: true, experimentalSessionSwitcher: true }).map(
    (plugin) => plugin.id,
  )

  expect(ids).toContain("internal:session-v2-debug")
  expect(ids).toContain("internal:session-switcher")
})
